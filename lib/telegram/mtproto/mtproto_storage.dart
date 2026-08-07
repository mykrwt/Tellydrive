import 'dart:io';

import 'package:path/path.dart' as p;

import '../../core/error/app_exception.dart';
import '../../core/storage/media_cache.dart';
import '../../core/utils/chunking.dart';
import '../../features/library/domain/entities/media_item.dart';
import '../core/telegram_storage.dart';
import '../metadata/metadata_codec.dart';
import 'mtproto_transport.dart';

/// [TelegramStorage] built on [MtprotoTransport].
///
/// * Uploads chunk large files into multiple Telegram documents.
/// * Stores full metadata on chunk 0 and the chunk manifest (message ids) after
///   all parts are sent, so the library can rebuild purely from Telegram.
/// * Downloads transparently re-join chunks under the original filename.
class MtprotoStorage implements TelegramStorage {
  MtprotoStorage({
    required MtprotoTransport transport,
    required int userId,
  })  : _transport = transport,
        _userId = userId;

  final MtprotoTransport _transport;
  final int _userId;

  int get userId => _userId;

  @override
  Future<MediaItem> uploadItem({
    required MediaItem item,
    required String localFilePath,
    ProgressCallback? onProgress,
  }) async {
    final source = File(localFilePath);
    if (!await source.exists()) {
      throw LocalStorageException('Source file does not exist: $localFilePath');
    }
    final totalSize = await source.length();
    final plan = ChunkingPlan.forSize(totalSize);

    final messageIds = <int>[];
    var uploadedBytes = 0;

    final tmpDir = await Directory.systemTemp.createTemp('tellybase_upload');

    try {
      for (var i = 0; i < plan.chunkCount; i++) {
        final range = plan.rangeFor(i);
        final chunkFile = File(p.join(tmpDir.path, 'chunk_$i'));
        await _writeChunk(source, range.start, range.end, chunkFile);

        final isFirst = i == 0;
        final caption = isFirst
            ? MetadataCodec.encodeItem(item) // n + ch filled below after upload
            : MetadataCodec.encodePart(itemId: item.id, index: i);

        final messageId = await _transport.sendDocumentChunk(
          userId: _userId,
          filePath: chunkFile.path,
          fileName: item.fileName,
          mime: item.mimeType,
          caption: caption,
        );
        messageIds.add(messageId);
        uploadedBytes += plan.sizeFor(i);
        onProgress?.call(uploadedBytes, totalSize);
      }
    } finally {
      try {
        await tmpDir.delete(recursive: true);
      } on Object {
        // best-effort cleanup
      }
    }

    if (messageIds.isEmpty) {
      throw const TelegramException('No chunks were uploaded.');
    }

    final completed = item.withMessageIds(messageIds.first, messageIds);

    // Persist the chunk manifest into chunk 0's caption so any future device
    // can locate every part of this file.
    await _transport.editCaption(
      userId: _userId,
      messageId: completed.firstMessageId,
      caption: MetadataCodec.encodeItem(completed),
    );

    return completed;
  }

  @override
  Future<File> downloadItem({
    required MediaItem item,
    required String destinationDir,
    ProgressCallback? onProgress,
  }) async {
    final dir = Directory(destinationDir);
    await dir.create(recursive: true);
    final finalPath = p.join(dir.path, item.fileName);

    final chunkIds = item.chunkMessageIds.isEmpty
        ? <int>[item.firstMessageId]
        : item.chunkMessageIds;

    if (chunkIds.length == 1) {
      await _transport.downloadMessageMedia(
        userId: _userId,
        messageId: chunkIds.first,
        destination: finalPath,
        onProgress: onProgress,
      );
      return File(finalPath);
    }

    // Multi-chunk: download every part to a temp file, then concatenate in
    // order into the final file under the original name.
    final tmpDir = await Directory.systemTemp.createTemp('tellybase_download');
    final parts = <File>[];
    var doneBytes = 0;
    try {
      for (var i = 0; i < chunkIds.length; i++) {
        final part = File(p.join(tmpDir.path, 'part_$i'));
        await _transport.downloadMessageMedia(
          userId: _userId,
          messageId: chunkIds[i],
          destination: part.path,
          onProgress: (d, t) => onProgress?.call(doneBytes + d, item.size),
        );
        parts.add(part);
        doneBytes += await part.length();
        onProgress?.call(doneBytes, item.size);
      }

      final out = File(finalPath);
      final sink = out.openWrite();
      try {
        for (final part in parts) {
          await (sink as dynamic).addStream(part.openRead());
        }
      } finally {
        await (sink as dynamic).close();
      }
    } finally {
      try {
        await tmpDir.delete(recursive: true);
      } on Object {
        // best-effort cleanup
      }
    }
    return File(finalPath);
  }

  @override
  Future<void> streamChunk({
    required int messageId,
    required Sink<List<int>> sink,
    ProgressCallback? onProgress,
  }) async {
    final tmp = await Directory.systemTemp.createTemp('tellybase_stream');
    try {
      final part = File(p.join(tmp.path, 'chunk'));
      await _transport.downloadMessageMedia(
        userId: _userId,
        messageId: messageId,
        destination: part.path,
        onProgress: onProgress,
      );
      await (sink as dynamic).addStream(part.openRead());
    } finally {
      await (sink as dynamic).close();
      try {
        await tmp.delete(recursive: true);
      } on Object {
        // best-effort cleanup
      }
    }
  }

  @override
  Future<List<MediaItem>> syncHistory() async {
    final items = <MediaItem>[];
    await _transport.forEachHistoryMessage(
      userId: _userId,
      onMessage: (message) async {
        if (!MetadataCodec.isOurs(message.caption)) return;
        try {
          items.add(MetadataCodec.decodeItem(message.caption!));
        } on MetadataException {
          // 'part' records and malformed/foreign captions are skipped.
        }
      },
    );
    // History is newest-first; de-duplicate just in case.
    final seen = <String>{};
    final unique = <MediaItem>[];
    for (final it in items) {
      if (seen.add(it.id)) unique.add(it);
    }
    return unique;
  }

  @override
  Future<void> updateItem(MediaItem item) async {
    await _transport.editCaption(
      userId: _userId,
      messageId: item.firstMessageId,
      caption: MetadataCodec.encodeItem(item),
    );
  }

  @override
  Future<void> deleteItems({
    required List<MediaItem> items,
    required bool permanently,
  }) async {
    if (permanently) {
      final ids = <int>[];
      for (final item in items) {
        ids.addAll(item.chunkMessageIds.isEmpty
            ? <int>[item.firstMessageId]
            : item.chunkMessageIds);
      }
      await _transport.deleteMessages(userId: _userId, messageIds: ids);
      return;
    }
    // Soft delete → mark trashed in Telegram.
    for (final item in items) {
      await updateItem(item.copyWith(trashed: true));
    }
  }

  /// Caches a freshly downloaded file into the local media cache.
  Future<void> cache(MediaItem item, File downloaded) async {
    try {
      await MediaCache.instance.put(item.firstMessageId, item.fileName, downloaded);
    } on Object {
      // cache is best-effort
    }
  }

  Future<void> _writeChunk(
    File source,
    int start,
    int end,
    File chunkFile,
  ) async {
    final raf = await source.open();
    final sink = chunkFile.openWrite();
    try {
      await raf.setPosition(start);
      var remaining = end - start;
      const bufSize = 1024 * 1024;
      while (remaining > 0) {
        final readLen = remaining < bufSize ? remaining : bufSize;
        final bytes = await raf.read(readLen);
        if (bytes.isEmpty) break;
        sink.add(bytes);
        remaining -= bytes.length;
      }
    } finally {
      await (sink as dynamic).close();
      await raf.close();
    }
  }
}
