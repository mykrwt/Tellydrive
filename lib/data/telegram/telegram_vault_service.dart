import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:collection/collection.dart';
import 'package:t/t.dart' as t;

import '../../core/config/telegram_config.dart';
import '../../core/constants/app_constants.dart';
import 'telegram_auth_service.dart';
import 'tl_extensions.dart';

/// TellyBase's "vault" is nothing exotic: it's a normal private Telegram
/// channel that lives in the user's own account, created automatically on
/// first login and used purely as a message stream to store file chunks
/// and a pinned JSON manifest. Nothing about it requires special
/// permissions beyond what any Telegram user already has, and the user can
/// see/inspect/export it from the regular Telegram app at any time.
///
/// Why a channel (not "Saved Messages")?
///   • Channels support very large membership-free storage and don't mix
///     TellyBase's chunk messages in with the user's personal saved notes.
///   • A channel can be pinned-message-addressed, which TellyBase uses to
///     always find its manifest in O(1) instead of scanning full history.
///   • Multiple devices signing into the same account naturally see the
///     same channel — that *is* the sync mechanism, for free, provided by
///     Telegram itself.
class TelegramVaultService {
  TelegramVaultService(this._auth);

  final TelegramAuthService _auth;

  t.Client get _client => _auth.client;

  int? _vaultChannelId;
  int? _vaultAccessHash;

  t.InputPeerBase get _vaultPeer {
    final id = _vaultChannelId;
    final hash = _vaultAccessHash;
    if (id == null || hash == null) {
      throw StateError('Vault channel not resolved yet. Call ensureVaultExists() first.');
    }
    return t.InputPeerChannel(channelId: id, accessHash: hash);
  }

  /// Looks for an existing TellyBase vault channel in the user's dialog
  /// list (present already if signing in on a *new* device after having
  /// used TellyBase before); creates a fresh one otherwise. Either way,
  /// after this call [uploadChunk] / [downloadChunk] / manifest I/O work.
  Future<void> ensureVaultExists() async {
    final dialogs = await _client.messages.getDialogs(
      excludePinned: false,
      folderId: null,
      offsetDate: DateTime.fromMillisecondsSinceEpoch(0),
      offsetId: 0,
      offsetPeer: const t.InputPeerEmpty(),
      limit: 100,
      hash: 0,
    );

    final chats = dialogs.result?.chats ?? const [];
    for (final chat in chats) {
      if (chat is t.Channel && chat.title == TelegramConfig.defaultVaultTitle) {
        final accessHash = chat.accessHash;
        if (accessHash != null) {
          _vaultChannelId = chat.id;
          _vaultAccessHash = accessHash;
          return;
        }
      }
    }

    final created = await _client.channels.createChannel(
      broadcast: true,
      megagroup: false,
      forImport: false,
      forum: false,
      title: TelegramConfig.defaultVaultTitle,
      about: TelegramConfig.defaultVaultAbout,
    );

    if (created.error != null) {
      throw StateError('Failed to create TellyBase vault channel: ${created.error!.errorMessage}');
    }

    final newChannel = created.result?.chats.whereType<t.Channel>().firstOrNull;
    final accessHash = newChannel?.accessHash;
    if (newChannel == null || accessHash == null) {
      throw StateError('Failed to create TellyBase vault channel.');
    }
    _vaultChannelId = newChannel.id;
    _vaultAccessHash = accessHash;
  }

  // -------------------------------------------------------------------
  // Chunk upload
  // -------------------------------------------------------------------

  /// Uploads one already-encrypted (or plaintext, if the user disabled
  /// file encryption) segment file to the vault as a Telegram document
  /// message, using MTProto's mandatory wire-part protocol
  /// (`upload.saveFilePart` for small files, `upload.saveBigFilePart` for
  /// anything over [AppConstants.bigFileThresholdBytes]).
  ///
  /// [onProgress] reports bytes uploaded so far for this single chunk —
  /// the caller (backup engine) aggregates this across all chunks of a
  /// file to drive the overall per-file progress bar.
  Future<UploadedChunkRef> uploadChunk({
    required File segmentFile,
    required String captionJson,
    void Function(int uploadedBytes, int totalBytes)? onProgress,
    Future<bool> Function()? isCancelled,
  }) async {
    final totalBytes = await segmentFile.length();
    final isBigFile = totalBytes > AppConstants.bigFileThresholdBytes;
    final fileId = Random.secure().nextInt(1 << 32) | (Random.secure().nextInt(1 << 30) << 32);

    final partSize = AppConstants.wirePartBytes;
    final totalParts = totalBytes == 0 ? 1 : (totalBytes / partSize).ceil();
    if (totalParts > AppConstants.maxWirePartsPerUpload) {
      throw StateError(
        'Segment too large for a single Telegram upload ($totalParts parts). '
        'This should not happen — the file chunker should have split it further.',
      );
    }

    final raf = await segmentFile.open();
    try {
      var uploaded = 0;
      for (var part = 0; part < totalParts; part++) {
        if (isCancelled != null && await isCancelled()) {
          throw const TransferCancelledException();
        }
        final bytes = await raf.read(partSize);
        final data = Uint8List.fromList(bytes);

        final result = isBigFile
            ? await _client.upload.saveBigFilePart(
                fileId: fileId,
                filePart: part,
                fileTotalParts: totalParts,
                bytes: data,
              )
            : await _client.upload.saveFilePart(
                fileId: fileId,
                filePart: part,
                bytes: data,
              );

        if (result.error != null) {
          throw StateError('Upload chunk failed: ${result.error!.errorMessage}');
        }

        uploaded += data.length;
        onProgress?.call(uploaded, totalBytes);
      }
    } finally {
      await raf.close();
    }

    final inputFile = isBigFile
        ? t.InputFileBig(id: fileId, parts: totalParts, name: 'chunk.bin')
        : t.InputFile(id: fileId, parts: totalParts, name: 'chunk.bin', md5Checksum: '');

    final media = t.InputMediaUploadedDocument(
      nosoundVideo: false,
      forceFile: true,
      spoiler: false,
      file: inputFile,
      mimeType: 'application/octet-stream',
      attributes: const [],
    );

    final sendResult = await _client.messages.sendMedia(
      silent: true,
      background: false,
      clearDraft: false,
      noforwards: true,
      updateStickersetsOrder: false,
      invertMedia: false,
      allowPaidFloodskip: false,
      peer: _vaultPeer,
      media: media,
      message: captionJson,
      randomId: Random.secure().nextInt(1 << 32) | (Random.secure().nextInt(1 << 30) << 32),
    );

    if (sendResult.error != null) {
      throw StateError('Failed to send chunk message: ${sendResult.error!.errorMessage}');
    }

    final messages = sendResult.result?.newMessages ?? const [];
    final newMessage = messages.whereType<t.Message>().firstOrNull;
    final document = _extractDocument(newMessage);

    if (newMessage == null || document == null) {
      throw StateError('Could not determine uploaded document for chunk message.');
    }

    return UploadedChunkRef(
      telegramMessageId: newMessage.id,
      telegramFileId: document.id,
      telegramAccessHash: document.accessHash,
      fileReference: document.fileReference,
    );
  }

  t.Document? _extractDocument(t.Message? message) {
    final media = message?.media;
    if (media is t.MessageMediaDocument) {
      final doc = media.document;
      if (doc is t.Document) return doc;
    }
    return null;
  }

  // -------------------------------------------------------------------
  // File reference refresh
  // -------------------------------------------------------------------

  /// Telegram's document "file reference" tokens are short-lived and can
  /// expire between upload time and a later download (e.g. restoring a
  /// backup weeks afterward). Rather than relying on a possibly-stale
  /// reference cached in the local index, TellyBase re-reads the original
  /// message right before every download and uses whatever reference is
  /// current *now* — exactly what official Telegram clients do whenever
  /// they hit a `FILE_REFERENCE_EXPIRED` error, except TellyBase simply
  /// always refreshes proactively to keep the download path simple.
  Future<UploadedChunkRef?> refreshChunkReference(int telegramMessageId) async {
    final result = await _client.channels.getMessages(
      channel: t.InputChannel(channelId: _vaultChannelId!, accessHash: _vaultAccessHash!),
      id: [t.InputMessageID(id: telegramMessageId)],
    );

    final message = result.result?.messages.whereType<t.Message>().firstOrNull;
    final document = _extractDocument(message);
    if (message == null || document == null) return null;

    return UploadedChunkRef(
      telegramMessageId: message.id,
      telegramFileId: document.id,
      telegramAccessHash: document.accessHash,
      fileReference: document.fileReference,
    );
  }

  // -------------------------------------------------------------------
  // Chunk download
  // -------------------------------------------------------------------

  /// Streams a previously uploaded chunk back down to [destination],
  /// resuming from [resumeFromByte] if a partial download already exists
  /// on disk (used for pause/resume).
  Future<void> downloadChunk({
    required int telegramFileId,
    required int telegramAccessHash,
    required List<int> fileReference,
    required File destination,
    required int totalBytes,
    int resumeFromByte = 0,
    void Function(int downloadedBytes, int totalBytes)? onProgress,
    Future<bool> Function()? isCancelled,
  }) async {
    const chunkLimit = 1024 * 1024; // 1 MiB read window, aligned to 4KiB per MTProto rules
    var offset = resumeFromByte;
    final sink = destination.openWrite(
      mode: resumeFromByte > 0 ? FileMode.append : FileMode.write,
    );

    try {
      while (totalBytes == 0 || offset < totalBytes) {
        if (isCancelled != null && await isCancelled()) {
          throw const TransferCancelledException();
        }
        final location = t.InputDocumentFileLocation(
          id: telegramFileId,
          accessHash: telegramAccessHash,
          fileReference: Uint8List.fromList(fileReference),
          thumbSize: '',
        );

        final result = await _client.upload.getFile(
          precise: false,
          cdnSupported: false,
          location: location,
          offset: offset,
          limit: chunkLimit,
        );

        if (result.error != null) {
          throw StateError('Download failed: ${result.error!.errorMessage}');
        }

        final file = result.result;
        if (file is t.UploadFile) {
          sink.add(file.bytes);
          offset += file.bytes.length;
          onProgress?.call(offset, totalBytes);
          if (file.bytes.length < chunkLimit) break;
        } else {
          break;
        }
      }
    } finally {
      await sink.flush();
      await sink.close();
    }
  }

  // -------------------------------------------------------------------
  // Manifest (pinned message) I/O — see ManifestService for the encrypted
  // JSON payload shape; this class just knows how to physically store /
  // retrieve it as a Telegram message.
  // -------------------------------------------------------------------

  Future<int> publishManifestBlob(Uint8List encryptedManifestBytes, {int? previousMessageId}) async {
    final tempPath =
        '${Directory.systemTemp.path}/tellybase_manifest_${DateTime.now().microsecondsSinceEpoch}.bin';
    final file = File(tempPath);
    await file.writeAsBytes(encryptedManifestBytes);

    final ref = await uploadChunk(
      segmentFile: file,
      captionJson: '${AppConstants.messageMagic}:MANIFEST',
    );
    await file.delete();

    await _client.messages.updatePinnedMessage(
      silent: true,
      unpin: false,
      pmOneside: false,
      peer: _vaultPeer,
      id: ref.telegramMessageId,
    );

    return ref.telegramMessageId;
  }

  /// Finds the currently pinned manifest message (if any) and returns the
  /// document reference needed to download it, or null if the vault has
  /// no manifest published yet (brand new vault).
  Future<PinnedManifestRef?> findPinnedManifest() async {
    final result = await _client.messages.search(
      peer: _vaultPeer,
      q: '',
      filter: const t.InputMessagesFilterPinned(),
      minDate: DateTime.fromMillisecondsSinceEpoch(0),
      maxDate: DateTime.fromMillisecondsSinceEpoch(0),
      offsetId: 0,
      addOffset: 0,
      limit: 1,
      maxId: 0,
      minId: 0,
      hash: 0,
    );

    final message = result.result?.messages.whereType<t.Message>().firstOrNull;
    final document = _extractDocument(message);
    if (message == null || document == null) return null;

    return PinnedManifestRef(
      messageId: message.id,
      telegramFileId: document.id,
      telegramAccessHash: document.accessHash,
      fileReference: document.fileReference,
      sizeBytes: document.size,
    );
  }

  /// Full-history scan used for "rebuild my index from scratch" on a new
  /// device, or as a fallback if the pinned manifest is ever missing —
  /// walks every TellyBase-tagged message in the vault and lets the
  /// caller reconstruct [FileEntry]/[ChunkInfo] purely from message
  /// metadata + captions, with zero external server involved.
  Stream<t.Message> scanAllVaultMessages({int pageSize = 100}) async* {
    var offsetId = 0;
    while (true) {
      final page = await _client.messages.getHistory(
        peer: _vaultPeer,
        offsetId: offsetId,
        offsetDate: DateTime.fromMillisecondsSinceEpoch(0),
        addOffset: 0,
        limit: pageSize,
        maxId: 0,
        minId: 0,
        hash: 0,
      );
      final messages = page.result?.messages.whereType<t.Message>().toList() ?? const [];
      if (messages.isEmpty) return;
      for (final m in messages) {
        yield m;
      }
      offsetId = messages.last.id;
    }
  }
}

class UploadedChunkRef {
  UploadedChunkRef({
    required this.telegramMessageId,
    required this.telegramFileId,
    required this.telegramAccessHash,
    required this.fileReference,
  });

  final int telegramMessageId;
  final int telegramFileId;
  final int telegramAccessHash;
  final Uint8List fileReference;
}

class PinnedManifestRef {
  PinnedManifestRef({
    required this.messageId,
    required this.telegramFileId,
    required this.telegramAccessHash,
    required this.fileReference,
    required this.sizeBytes,
  });

  final int messageId;
  final int telegramFileId;
  final int telegramAccessHash;
  final Uint8List fileReference;
  final int sizeBytes;
}

class TransferCancelledException implements Exception {
  const TransferCancelledException();
  @override
  String toString() => 'TransferCancelledException';
}
