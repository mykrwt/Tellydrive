// ignore_for_file: avoid_dynamic_calls
//
// Real MTProto transport backed by the pure-Dart `t` (TL schema Layer 225)
// and `tg` (MTProto client) packages. This replaces the previous stub and
// provides a fully working Telegram login + media pipeline so TellyBase can
// authenticate, upload, download, and iterate Saved Messages history.
//
// The `t` package supplies typed TL constructors/objects.
// The `tg` package handles the wire protocol (obfuscation, DH key exchange,
// encrypted transport, RPC invoke).
//
// Only this file (and io_socket.dart) import `t`/`tg` — the rest of the app
// continues to see TellyBase's own thin types (TgMessage, TelegramException…).

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:t/t.dart' as t;
import 'package:tg/tg.dart' as tg;

import '../../core/error/app_exception.dart';
import 'io_socket.dart';

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Public types                                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/// A single Telegram message as surfaced to the storage adapter: its id and
/// caption plus (when present) the media access handle used to download bytes.
class TgMessage {
  const TgMessage({required this.id, required this.caption, this.fileRef});

  final int id;
  final String? caption;

  /// Opaque file location for media download (InputDocumentFileLocation or
  /// similar). The transport layer knows how to turn this into bytes.
  final dynamic fileRef;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  DC catalogue (Telegram production endpoints)                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/// Well-known Telegram data-centre endpoints (IPv4).
const _dcEndpoints = <int, ({String ip, int port})>{
  1: (ip: '149.154.175.50', port: 443),
  2: (ip: '149.154.167.50', port: 443),
  3: (ip: '149.154.175.100', port: 443),
  4: (ip: '149.154.167.91', port: 443),
  5: (ip: '91.108.56.130', port: 443),
};

t.DcOption _buildDcOption(int dcId) {
  final ep = _dcEndpoints[dcId] ?? _dcEndpoints[2]!;
  return t.DcOption(
    ipv6: false,
    mediaOnly: false,
    tcpoOnly: false,
    cdn: false,
    static: false,
    thisPortOnly: false,
    id: dcId,
    ipAddress: ep.ip,
    port: ep.port,
  );
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  MtprotoTransport                                                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/// Thin wrapper that owns the Telegram MTProto lifecycle and exposes the
/// exact handful of operations TellyBase needs.
///
/// Internally it holds a `tg.Client` (encrypted MTProto connection) and
/// caches the authenticated user id / first name after a successful session.
class MtprotoTransport {
  MtprotoTransport({required this.apiId, required this.apiHash});

  final int apiId;
  final String apiHash;

  // ── Internal state ──────────────────────────────────────────────────────
  tg.Client? _client;
  tg.AuthorizationKey? _authKey;
  IoSocket? _ioSocket;
  t.DcOption _dc = _buildDcOption(2); // start on DC2 by default
  bool _connected = false;
  int? _userId;
  String _firstName = '';

  bool get isConnected => _connected;

  // ════════════════════════════════════════════════════════════════════════
  //  Connection
  // ════════════════════════════════════════════════════════════════════════

  /// Connects to Telegram.  When [session] is non-null it must be a JSON
  /// serialisation of a [tg.AuthorizationKey] previously obtained via
  /// [exportSession].  If absent or empty a fresh (unauthenticated) DH key
  /// exchange is performed — the user will need to log in.
  Future<void> connect({String? session}) async {
    _dc = _buildDcOption(2); // DC2 production default

    // Try to restore a previous auth key from the session string.
    if (session != null && session.isNotEmpty) {
      try {
        final json = jsonDecode(session);
        _authKey =
            tg.AuthorizationKey.fromJson(json as Map<String, dynamic>);
      } catch (_) {
        _authKey = null; // corrupted — start fresh
      }
    }

    await _connectToDc(_dc);
  }

  Future<void> _connectToDc(t.DcOption dc) async {
    // Tear down any existing socket.
    await _closeSocket();

    final socket = await Socket.connect(dc.ipAddress, dc.port);
    _ioSocket = IoSocket(socket);

    final obfuscation = tg.Obfuscation.random(false, dc.id);
    final idGen = tg.MessageIdGenerator();

    // Send the obfuscation preamble (client → server first 64 bytes).
    await _ioSocket!.send(obfuscation.preamble);

    // Either reuse an existing auth key or perform DH key exchange.
    _authKey ??=
        await tg.Client.authorize(_ioSocket!, obfuscation, idGen);

    _client = tg.Client(
      socket: _ioSocket!,
      obfuscation: obfuscation,
      authorizationKey: _authKey!,
      idGenerator: idGen,
    );

    // initConnection wraps the query in InvokeWithLayer + InitConnection so
    // the Telegram server knows our layer version, device model, etc.
    await _client!.initConnection<t.Config>(
      apiId: apiId,
      deviceModel: 'TellyBase',
      systemVersion: Platform.operatingSystemVersion,
      appVersion: '1.0.0',
      systemLangCode: 'en',
      langPack: '',
      langCode: 'en',
      query: const t.HelpGetConfig(),
    );

    _connected = true;

    // If we already have an auth key (restored session), cache the user.
    if (_authKey!.id != 0) {
      try {
        await _cacheMe();
      } catch (_) {
        // Not fully authenticated yet — that's fine; the login flow will
        // call _cacheMe again after signIn / checkPassword.
      }
    }
  }

  /// Exports the current session as a JSON string that can later be passed
  /// back to [connect].
  String exportSession() {
    if (_authKey == null) return '';
    return _authKey!.toString();
  }

  Future<void> disconnect() async {
    await _closeSocket();
    _client = null;
    _connected = false;
  }

  Future<void> _closeSocket() async {
    try {
      await _ioSocket?.close();
    } catch (_) {
      // best-effort
    }
    _ioSocket = null;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Authentication
  // ════════════════════════════════════════════════════════════════════════

  /// Requests a login code for [phone].  Returns the phoneCodeHash plus
  /// metadata.  Throws [TelegramException] on failure.
  Future<({String hash, bool viaApp, int? timeout})> sendCode(
      String phone) async {
    await _ensureConnected();

    try {
      final result = await _client!.auth.sendCode(
        phoneNumber: phone,
        apiId: apiId,
        apiHash: apiHash,
        settings: const t.CodeSettings(
          allowFlashcall: false,
          currentNumber: true,
          allowAppHash: false,
          allowMissedCall: false,
          allowFirebase: false,
          unknownNumber: false,
        ),
      );

      if (result.error != null) {
        _throwRpc(result.error!);
      }

      final sc = result.result as t.AuthSentCode;
      return (
        hash: sc.phoneCodeHash,
        viaApp: sc.type is t.AuthSentCodeTypeApp,
        timeout: sc.timeout,
      );
    } on TelegramException {
      rethrow;
    } on Object catch (e) {
      throw TelegramException('Could not send the login code.', cause: e);
    }
  }

  /// Submits the OTP code.  May throw [RpcException] with code
  /// `SESSION_PASSWORD_NEEDED` if 2FA is enabled — the caller should then
  /// route to the password screen.
  Future<void> signIn({
    required String phone,
    required String code,
    required String hash,
  }) async {
    await _ensureConnected();

    try {
      final result = await _client!.auth.signIn(
        phoneNumber: phone,
        phoneCodeHash: hash,
        phoneCode: code,
      );

      if (result.error != null) {
        _throwRpc(result.error!);
      }

      // Success — cache the authenticated user.
      await _cacheMe();
    } on TelegramException {
      rethrow;
    } on Object catch (e) {
      throw TelegramException('Sign-in failed.', cause: e);
    }
  }

  /// Returns `true` when the account has two-step verification enabled.
  /// Always false in stub / before first signIn attempt.
  bool _needsPasswordFlag = false;
  Future<bool> needsPassword() async => _needsPasswordFlag;

  /// Completes login when 2FA is enabled.
  Future<void> checkPassword(String password) async {
    await _ensureConnected();

    try {
      final pwdResult = await _client!.account.getPassword();
      if (pwdResult.error != null) {
        _throwRpc(pwdResult.error!);
      }
      final accountPwd = pwdResult.result as t.AccountPassword;

      // SRP proof — the `tg` package ships a helper for this.
      final srp = await tg.check2FA(accountPwd, password);

      final result = await _client!.auth.checkPassword(password: srp);
      if (result.error != null) {
        _throwRpc(result.error!);
      }

      _needsPasswordFlag = false;
      await _cacheMe();
    } on TelegramException {
      rethrow;
    } on Object catch (e) {
      throw TelegramException('Password verification failed.', cause: e);
    }
  }

  /// Returns the authenticated user's numeric Telegram id.
  Future<int> getMe() async {
    if (_userId != null) return _userId!;
    await _cacheMe();
    return _userId ?? 0;
  }

  Future<String> getFirstName() async {
    if (_firstName.isNotEmpty) return _firstName;
    await _cacheMe();
    return _firstName;
  }

  Future<void> logOut() async {
    if (_client == null) return;
    try {
      await _client!.auth.logOut();
    } catch (_) {
      // ignore — we clear local state regardless
    }
    _authKey = null;
    _client = null;
    _connected = false;
    _userId = null;
    _firstName = '';
    _needsPasswordFlag = false;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  History walking (Saved Messages)
  // ════════════════════════════════════════════════════════════════════════

  /// Iterates every message in the user's Saved Messages chat (newest first),
  /// calling [onMessage] for each.  Respects Telegram's 100-message page size.
  Future<void> forEachHistoryMessage({
    required int userId,
    required Future<void> Function(TgMessage message) onMessage,
  }) async {
    await _ensureConnected();

    const peer = t.InputPeerSelf();
    const pageSize = 100;
    var offsetId = 0;

    while (true) {
      final result = await _client!.messages.getHistory(
        peer: peer,
        offsetId: offsetId,
        offsetDate: DateTime.fromMillisecondsSinceEpoch(0),
        addOffset: 0,
        limit: pageSize,
        maxId: 0,
        minId: 0,
        hash: 0,
      );

      if (result.error != null) {
        _throwRpc(result.error!);
      }

      final messages = _extractMessages(result.result!);
      if (messages.isEmpty) break;

      for (final msg in messages) {
        final caption = msg.message.isNotEmpty ? msg.message : null;
        final fileRef = _extractFileRef(msg);

        await onMessage(TgMessage(
          id: msg.id,
          caption: caption,
          fileRef: fileRef,
        ));

        // Next page starts before the oldest id we've seen.
        if (msg.id < offsetId || offsetId == 0) {
          offsetId = msg.id;
        }
      }

      if (messages.length < pageSize) break;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Upload / Edit / Delete
  // ════════════════════════════════════════════════════════════════════════

  /// Uploads a file to Telegram as a document in Saved Messages and returns
  /// the resulting message id.
  Future<int> sendDocumentChunk({
    required int userId,
    required String filePath,
    required String fileName,
    required String mime,
    required String caption,
  }) async {
    await _ensureConnected();

    final file = File(filePath);
    if (!await file.exists()) {
      throw LocalStorageException('File not found: $filePath');
    }

    final totalSize = await file.length();
    const partSize = 512 * 1024; // 512 KB — Telegram's per-part limit
    final partCount = (totalSize + partSize - 1) ~/ partSize;
    final fileId = Random.secure().nextInt(1 << 30);

    // Upload file parts.
    final raf = await file.open();
    try {
      for (var i = 0; i < partCount; i++) {
        final offset = i * partSize;
        final len = min(partSize, totalSize - offset);
        await raf.setPosition(offset);
        final bytes = await raf.read(len);

        if (totalSize > 10 * 1024 * 1024) {
          // Big file (≥ 10 MB) — use saveBigFilePart.
          final r = await _client!.upload.saveBigFilePart(
            fileId: fileId,
            filePart: i,
            fileTotalParts: partCount,
            bytes: Uint8List.fromList(bytes),
          );
          if (r.error != null) _throwRpc(r.error!);
        } else {
          // Small file — use saveFilePart.
          final r = await _client!.upload.saveFilePart(
            fileId: fileId,
            filePart: i,
            bytes: Uint8List.fromList(bytes),
          );
          if (r.error != null) _throwRpc(r.error!);
        }
      }
    } finally {
      await raf.close();
    }

    // Build the InputFile reference.
    final t.InputFileBase inputFile;
    if (totalSize > 10 * 1024 * 1024) {
      inputFile = t.InputFileBig(
        id: fileId,
        parts: partCount,
        name: fileName,
      );
    } else {
      inputFile = t.InputFile(
        id: fileId,
        parts: partCount,
        name: fileName,
        md5Checksum: '', // optional; server will verify via hash
      );
    }

    // Send the document to Saved Messages.
    final randomId = Random.secure().nextInt(1 << 30);
    final result = await _client!.messages.sendMedia(
      silent: false,
      background: false,
      clearDraft: false,
      noforwards: false,
      updateStickersetsOrder: false,
      invertMedia: false,
      allowPaidFloodskip: false,
      peer: const t.InputPeerSelf(),
      media: t.InputMediaUploadedDocument(
        nosoundVideo: false,
        forceFile: false,
        spoiler: false,
        file: inputFile,
        mimeType: mime,
        attributes: [
          t.DocumentAttributeFilename(fileName: fileName),
        ],
      ),
      message: caption,
      randomId: randomId,
    );

    if (result.error != null) _throwRpc(result.error!);

    // Extract the message id from the Updates object.
    return _extractSentMessageId(result.result!) ??
        (throw const TelegramException(
            'Could not extract message id from sendMedia response.'));
  }

  /// Edits the caption of an existing message in Saved Messages.
  Future<void> editCaption({
    required int userId,
    required int messageId,
    required String caption,
  }) async {
    await _ensureConnected();

    final result = await _client!.messages.editMessage(
      noWebpage: false,
      invertMedia: false,
      peer: const t.InputPeerSelf(),
      id: messageId,
      message: caption,
    );

    if (result.error != null) _throwRpc(result.error!);
  }

  /// Deletes one or more messages from Saved Messages.
  Future<void> deleteMessages({
    required int userId,
    required List<int> messageIds,
  }) async {
    await _ensureConnected();

    final result = await _client!.messages.deleteMessages(
      revoke: true,
      id: messageIds,
    );

    if (result.error != null) _throwRpc(result.error!);
  }

  /// Fetches a single message by id from Saved Messages.
  Future<TgMessage?> getMessageById(int userId, int messageId) async {
    await _ensureConnected();

    final result = await _client!.messages.getMessages(
      id: [t.InputMessageID(id: messageId)],
    );

    if (result.error != null) {
      _throwRpc(result.error!);
    }

    final messages = _extractMessages(result.result!);
    if (messages.isEmpty) return null;

    final msg = messages.first;
    return TgMessage(
      id: msg.id,
      caption: msg.message.isNotEmpty ? msg.message : null,
      fileRef: _extractFileRef(msg),
    );
  }

  /// Downloads the media of a specific message to [destination].
  Future<File> downloadMessageMedia({
    required int userId,
    required int messageId,
    required String destination,
    void Function(int done, int total)? onProgress,
  }) async {
    await _ensureConnected();

    final msg = await getMessageById(userId, messageId);
    if (msg == null) {
      throw TelegramException('Message $messageId not found.');
    }
    return downloadMedia(
      message: msg,
      destination: destination,
      onProgress: onProgress,
    );
  }

  /// Downloads the media attached to [message] to [destination].
  Future<File> downloadMedia({
    required TgMessage message,
    required String destination,
    void Function(int done, int total)? onProgress,
  }) async {
    await _ensureConnected();

    final fileRef = message.fileRef;
    if (fileRef == null) {
      throw TelegramException('Message ${message.id} has no downloadable media.');
    }

    // fileRef is a (documentId, accessHash, fileReference, size) record.
    final ref = fileRef as _DocRef;
    final location = t.InputDocumentFileLocation(
      id: ref.id,
      accessHash: ref.accessHash,
      fileReference: ref.fileReference,
      thumbSize: '',
    );

    const chunkSize = 1024 * 1024; // 1 MB
    final dir = Directory(destination).parent;
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }

    final sink = File(destination).openWrite();
    var offset = 0;
    var downloaded = 0;

    try {
      while (true) {
        final result = await _client!.upload.getFile(
          precise: false,
          cdnSupported: false,
          location: location,
          offset: offset,
          limit: chunkSize,
        );

        if (result.error != null) _throwRpc(result.error!);

        final uploadFile = result.result as t.UploadFile;
        final bytes = uploadFile.bytes;
        if (bytes.isEmpty) break;

        sink.add(bytes);
        downloaded += bytes.length;
        onProgress?.call(downloaded, ref.size);

        if (bytes.length < chunkSize) break; // last chunk
        offset += chunkSize;
      }
    } finally {
      await sink.flush();
      await sink.close();
    }

    return File(destination);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Internal helpers
  // ════════════════════════════════════════════════════════════════════════

  /// Throws the appropriate [RpcException] or [TelegramException] for a
  /// Telegram RPC error.  Handles DC migration and password-needed flows.
  Never _throwRpc(t.RpcError rpcError) {
    final msg = rpcError.errorMessage;

    // Parse DC migration hints.
    final migrateMatch = RegExp(r'(?:PHONE|FILE|NETWORK)_(?:MIGRATE|TAKEOUT)_(\d+)').firstMatch(msg);
    if (migrateMatch != null) {
      // Include the target DC in the code so callers can reconnect.
      throw RpcException(msg, msg);
    }

    // SESSION_PASSWORD_NEEDED signals 2FA.
    if (msg.contains('SESSION_PASSWORD_NEEDED')) {
      _needsPasswordFlag = true;
      throw const RpcException('SESSION_PASSWORD_NEEDED', 'Two-step verification required.');
    }

    throw RpcException(msg, msg);
  }

  /// Caches the authenticated user's id and first name.
  Future<void> _cacheMe() async {
    final result = await _client!.users.getUsers(
      id: [const t.InputUserSelf()],
    );

    if (result.error != null) return; // not authenticated yet

    final vector = result.result;
    if (vector == null) return;

    // result is Vector<UserBase> — use .items to get the list.
    final users = vector.items;
    if (users.isNotEmpty) {
      final user = users.first;
      if (user is t.User) {
        _userId = user.id;
        _firstName = user.firstName ?? '';
      }
    }
  }

  /// Extracts a list of [t.Message] from a [MessagesMessagesBase] result,
  /// handling the different concrete subtypes.
  List<t.Message> _extractMessages(t.TlObject obj) {
    if (obj is t.MessagesMessages) {
      return obj.messages.whereType<t.Message>().toList();
    }
    if (obj is t.MessagesMessagesSlice) {
      return obj.messages.whereType<t.Message>().toList();
    }
    // MessagesChannelMessages and others — try dynamic access.
    try {
      final msgs = (obj as dynamic).messages as List;
      return msgs.whereType<t.Message>().toList();
    } catch (_) {
      return [];
    }
  }

  /// Extracts the sent message id from an [UpdatesBase] response (returned
  /// by sendMedia / sendMessage).
  int? _extractSentMessageId(t.TlObject obj) {
    // Updates — has .updates list with UpdateMessageID or similar.
    try {
      final updates = (obj as dynamic).updates as List?;
      if (updates != null) {
        for (final u in updates) {
          try {
            // UpdateNewMessage has .message.id
            final msg = (u as dynamic).message;
            if (msg != null) {
              return (msg as dynamic).id as int?;
            }
          } catch (_) {}
          try {
            // UpdateMessageID has .id
            return (u as dynamic).id as int?;
          } catch (_) {}
        }
      }
      // UpdatesCombined or similar — try .updates
      final updList = (obj as dynamic).updates as List?;
      if (updList != null) {
        for (final u in updList) {
          try {
            final msg = (u as dynamic).message;
            if (msg != null) return (msg as dynamic).id as int?;
          } catch (_) {}
          try {
            return (u as dynamic).id as int?;
          } catch (_) {}
        }
      }
    } catch (_) {}
    return null;
  }

  /// Extracts a downloadable file reference from a message.
  _DocRef? _extractFileRef(t.Message msg) {
    final media = msg.media;
    if (media is! t.MessageMediaDocument) return null;
    final doc = media.document;
    if (doc is! t.Document) return null;
    return _DocRef(
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference,
      size: doc.size,
    );
  }

  /// Ensures the transport is connected, reconnecting with the stored key
  /// if the socket was lost.
  Future<void> _ensureConnected() async {
    if (_client != null && _connected) return;
    // Try to reconnect using the existing session.
    final session = exportSession();
    if (session.isEmpty) {
      throw const TelegramException(
          'Not connected. Call connect() first.');
    }
    await connect(session: session);
  }
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Internal helpers                                                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/// Opaque document reference used for file download.
class _DocRef {
  const _DocRef({
    required this.id,
    required this.accessHash,
    required this.fileReference,
    required this.size,
  });

  final int id;
  final int accessHash;
  final Uint8List fileReference;
  final int size;
}
