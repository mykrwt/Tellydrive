// ignore_for_file: avoid_dynamic_calls
//
// ─────────────────────────────────────────────────────────────────────────────
//  THE ONLY FILE THAT IMPORTS `package:mtproto`.
// ─────────────────────────────────────────────────────────────────────────────
//
// Everything above this layer is protocol-agnostic. This file maps the small
// set of Telegram TL surfaces TellyBase needs onto the `mtproto` package's
// `TelegramClient`. If you upgrade `mtproto` / `televerse`, adjust the method
// calls here and nowhere else.
//
// The concrete signatures below follow the `mtproto` TelegramClient API:
//   * sendCode / signIn / getPassword / checkPassword / getMe
//   * getHistory(peer, ...) for the Saved Messages scan
//   * sendMedia / editMessage / deleteMessages for uploads & updates
//   * downloadFile / uploadFile for streaming media bytes
// Verify these against the exact version you pin and tweak this one file.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:io';

import 'package:mtproto/mtproto.dart' as mtp;

import '../../core/config/app_config.dart';
import '../../core/error/app_exception.dart';

/// A single Telegram message as surfaced to the storage adapter: its id and
/// caption plus (when present) the media access handle used to download bytes.
class TgMessage {
  const TgMessage({required this.id, required this.caption, this.fileRef});

  final int id;
  final String? caption;

  /// Opaque file location for media download (InputFileLocation).
  final dynamic fileRef;
}

/// Thin wrapper that owns the [TelegramClient] lifecycle and exposes the exact
/// handful of operations TellyBase needs. All public methods already return
/// TellyBase types so the rest of the app never sees MTProto objects.
class MtprotoTransport {
  MtprotoTransport({required int apiId, required String apiHash})
      : _client = mtp.TelegramClient(apiId, apiHash, mtp.Client());

  final mtp.TelegramClient _client;

  mtp.TelegramClient get raw => _client;

  bool _connected = false;
  bool get isConnected => _connected;

  /// The user's Saved Messages peer (self).
  static int _selfPeer(int userId) => userId;

  /// Connects and restores an optional persisted session.
  Future<void> connect({String? session}) async {
    if (session != null && session.isNotEmpty) {
      _client.setSession(session);
    }
    await _client.connect();
    _connected = true;
  }

  /// Exports the current session string for secure persistence.
  String exportSession() => _client.sessionString ?? '';

  Future<void> disconnect() async {
    if (_connected) {
      await _client.disconnect();
      _connected = false;
    }
  }

  Future<void> logOut() async {
    try {
      await _client.logOut();
    } on Object {
      // Local session invalidation is what matters to the app.
    }
  }

  // ── Authentication ─────────────────────────────────────────────────────────

  Future<({String hash, bool viaApp, int? timeout})> sendCode(
    String phone,
  ) async {
    final sent = await _client.sendCode(
      phone,
      apiId: AppConfig.telegramApiId,
      apiHash: AppConfig.telegramApiHash,
    );
    final hash = sent.phoneCodeHash;
    if (hash == null || hash.isEmpty) {
      throw const TelegramException('Telegram did not return a code hash.');
    }
    final viaApp = sent.type?.caseName == 'authSentCodeTypeApp';
    return (hash: hash, viaApp: viaApp, timeout: sent.timeout);
  }

  Future<void> signIn({
    required String phone,
    required String code,
    required String hash,
  }) async {
    try {
      await _client.signIn(phone, code, hash);
    } on mtp.RPCError catch (e) {
      throw RpcException(e.code, e.message ?? e.toString());
    }
  }

  /// Returns true if the account needs a two-step password.
  Future<bool> needsPassword() async {
    try {
      final pwd = await _client.getPassword();
      return pwd.hasPassword;
    } on Object {
      return false;
    }
  }

  Future<void> checkPassword(String password) async {
    try {
      await _client.checkPassword(password);
    } on mtp.RPCError catch (e) {
      throw RpcException(e.code, e.message ?? e.toString());
    }
  }

  Future<int> getMe() async {
    final me = await _client.getMe();
    final id = me.id;
    if (id == null) {
      throw const TelegramException('Could not resolve the signed-in user.');
    }
    return id;
  }

  Future<String> getFirstName() async {
    try {
      final me = await _client.getMe();
      return me.firstName ?? '';
    } on Object {
      return '';
    }
  }

  // ── History (library rebuild) ─────────────────────────────────────────────

  /// Walks the Saved Messages history newest-first in pages, yielding each
  /// message id + caption. [userId] is the Signed-in user (Saved Messages peer).
  Future<void> forEachHistoryMessage({
    required int userId,
    required Future<void> Function(TgMessage message) onMessage,
  }) async {
    var offsetId = 0;
    const pageSize = 100;
    var done = false;
    var guard = 0;

    while (!done && guard < 2000) {
      final messages = await _client.getHistory(
        peer: _selfPeer(userId),
        limit: pageSize,
        offsetId: offsetId,
        addOffset: -1,
      );
      final list = messages.messages;
      if (list == null || list.isEmpty) break;

      for (final m in list) {
        if (m is mtp.Message) {
          final caption = m.message;
          final media = m.media;
          final fileRef = media is mtp.MessageMediaDocument
              ? media.document
              : (media is mtp.MessageMediaPhoto ? media.photo : null);
          await onMessage(TgMessage(id: m.id ?? 0, caption: caption, fileRef: fileRef));
        }
      }
      final last = list.last;
      if (last is mtp.Message && last.id != null) {
        if (last.id == offsetId) break;
        offsetId = last.id!;
      } else {
        break;
      }
      done = list.length < pageSize;
      guard++;
    }
  }

  // ── Uploads ────────────────────────────────────────────────────────────────

  /// Sends a single chunk as a Telegram document and returns its message id.
  Future<int> sendDocumentChunk({
    required int userId,
    required String filePath,
    required String fileName,
    required String mime,
    required String caption,
  }) async {
    try {
      final message = await _client.sendMedia(
        peer: _selfPeer(userId),
        file: mtp.InputFile(filePath, name: fileName, mimeType: mime),
        caption: caption,
        attributes: [
          mtp.DocumentAttributeFilename(fileName: fileName),
        ],
      );
      final id = message.id;
      if (id == null) {
        throw const TelegramException('Upload succeeded but returned no message id.');
      }
      return id;
    } on mtp.RPCError catch (e) {
      throw RpcException(e.code, e.message ?? e.toString());
    }
  }

  Future<void> editCaption({
    required int userId,
    required int messageId,
    required String caption,
  }) async {
    try {
      await _client.editMessage(
        peer: _selfPeer(userId),
        id: messageId,
        message: caption,
      );
    } on mtp.RPCError catch (e) {
      throw RpcException(e.code, e.message ?? e.toString());
    }
  }

  Future<void> deleteMessages({
    required int userId,
    required List<int> messageIds,
  }) async {
    if (messageIds.isEmpty) return;
    try {
      await _client.deleteMessages(
        peer: _selfPeer(userId),
        ids: messageIds,
      );
    } on mtp.RPCError catch (e) {
      throw RpcException(e.code, e.message ?? e.toString());
    }
  }

  /// Finds a single message by id (for downloads we need its media fileRef).
  Future<TgMessage?> getMessageById(int userId, int messageId) async {
    final msgs = await _client.getMessages(
      peer: _selfPeer(userId),
      ids: [messageId],
    );
    for (final m in msgs) {
      if (m is mtp.Message && m.id == messageId) {
        final media = m.media;
        final fileRef = media is mtp.MessageMediaDocument
            ? media.document
            : (media is mtp.MessageMediaPhoto ? media.photo : null);
        return TgMessage(id: messageId, caption: m.message, fileRef: fileRef);
      }
    }
    return null;
  }

  /// Downloads a chunk message's media to [destination], reporting progress.
  Future<File> downloadMessageMedia({
    required int userId,
    required int messageId,
    required String destination,
    void Function(int done, int total)? onProgress,
  }) async {
    final message = await getMessageById(userId, messageId);
    if (message == null || message.fileRef == null) {
      throw ChunkedFileException(
        'Chunk message $messageId has no downloadable media.',
      );
    }
    return downloadMedia(
      message: message,
      destination: destination,
      onProgress: onProgress,
    );
  }

  // ── Downloads ──────────────────────────────────────────────────────────────

  /// Downloads a message's media bytes to [destination], reporting progress.
  Future<File> downloadMedia({
    required TgMessage message,
    required String destination,
    void Function(int done, int total)? onProgress,
  }) async {
    final loc = message.fileRef;
    if (loc == null) {
      throw ChunkedFileException('Message ${message.id} has no downloadable media.');
    }
    try {
      final file = await _client.downloadFile(
        loc,
        size: _documentSize(loc),
        destination: destination,
        onProgress: onProgress,
      );
      return File(file);
    } on mtp.RPCError catch (e) {
      throw RpcException(e.code, e.message ?? e.toString());
    }
  }

  int _documentSize(dynamic loc) {
    try {
      return loc?.size as int? ?? 0;
    } on Object {
      return 0;
    }
  }
}
