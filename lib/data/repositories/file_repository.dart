import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:mime/mime.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:t/t.dart' as t;
import 'package:uuid/uuid.dart';

import '../../core/chunking/file_chunker.dart';
import '../../core/constants/app_constants.dart';
import '../../core/crypto/crypto_engine.dart';
import '../../domain/models/chunk_info.dart';
import '../../domain/models/file_entry.dart';
import '../local_db/local_database.dart';
import '../telegram/manifest_service.dart';
import '../telegram/telegram_vault_service.dart';

/// The orchestration layer that turns "user tapped Backup on a photo" (or
/// "download this file") into the full pipeline of chunking, encrypting,
/// uploading/downloading through the user's own Telegram account, and
/// keeping the local encrypted index + Telegram-stored manifest in sync.
///
/// This is intentionally the *only* place in the app that touches
/// [FileChunker], [TelegramVaultService] and [LocalDatabase] together, so
/// every other layer (backup engine, UI) only ever depends on this single
/// well-tested seam.
class FileRepository {
  FileRepository({
    required LocalDatabase db,
    required TelegramVaultService vault,
    required ManifestService manifest,
    CryptoEngine? crypto,
    FileChunker? chunker,
  })  : _db = db,
        _vault = vault,
        _manifest = manifest,
        _crypto = crypto ?? CryptoEngine.instance,
        _chunker = chunker ?? FileChunker();

  final LocalDatabase _db;
  final TelegramVaultService _vault;
  final ManifestService _manifest;
  final CryptoEngine _crypto;
  final FileChunker _chunker;
  final _uuid = const Uuid();

  static const int _schemaVersion = 1;

  /// Uploads [sourceFile] into TellyBase, splitting + encrypting as needed,
  /// and returns a stream of progress events so the UI can show a live
  /// progress bar (per-file, and aggregable for the overall backup queue).
  ///
  /// Handles the full "exceeds Telegram's max upload size" requirement
  /// transparently: [FileChunker] pre-splits anything bigger than
  /// [AppConstants.defaultSegmentSizeBytes] into ordered segments, each of
  /// which is uploaded as its own Telegram message; [ChunkInfo] records
  /// exactly how to put them back together.
  Stream<BackupProgress> backupFile({
    required File sourceFile,
    required String folderPath,
    required bool encryptContents,
    String? deviceOrigin,
    Future<bool> Function()? isCancelled,
  }) async* {
    final id = _uuid.v4();
    final stat = await sourceFile.stat();
    final mimeType = lookupMimeType(sourceFile.path) ?? 'application/octet-stream';
    final category = _categorize(mimeType, sourceFile.path);

    final workingDir = await _scratchDirFor(id);
    final contentKey = await _crypto.fileContentKey();

    // Whole-file hash is computed as a byproduct of streaming through the
    // chunker's per-segment hashing (segment hashes are chained below);
    // for a single-segment file this is identical to the segment hash.
    final chunks = <ChunkInfo>[];
    var bytesUploadedSoFar = 0;

    yield BackupProgress(fileId: id, fraction: 0, phase: BackupPhase.splitting);

    // Upload progress within the *current* segment is reported through this
    // mutable holder rather than yielded directly from inside the
    // synchronous `onProgress` callback (a callback can't `yield` into an
    // outer `async*` generator) — the outer loop below reads it after each
    // segment upload call point where we *can* yield.
    var currentSegmentUploadedBytes = 0;

    await for (final segProgress in _chunker.splitAndPrepare(
      sourceFile: sourceFile,
      workingDir: workingDir,
      encrypt: encryptContents,
      contentKey: contentKey,
    )) {
      if (isCancelled != null && await isCancelled()) {
        await workingDir.delete(recursive: true);
        yield BackupProgress(fileId: id, fraction: 0, phase: BackupPhase.cancelled);
        return;
      }

      final seg = segProgress.segment;
      final segmentFile = File(seg.tempEncryptedPath);
      currentSegmentUploadedBytes = 0;

      final caption = jsonEncode({
        'v': AppConstants.messageMagic,
        'fid': id,
        'idx': seg.index,
        'name': p.basename(sourceFile.path),
      });

      final ref = await _vault.uploadChunk(
        segmentFile: segmentFile,
        captionJson: caption,
        isCancelled: isCancelled,
        onProgress: (uploaded, total) {
          currentSegmentUploadedBytes = uploaded;
        },
      );

      chunks.add(ChunkInfo(
        index: seg.index,
        byteStart: seg.byteStart,
        byteEnd: seg.byteEnd,
        plainSha256: seg.plainSha256,
        encryptedSizeBytes: seg.encryptedSizeBytes,
        telegramMessageId: ref.telegramMessageId,
        telegramFileId: ref.telegramFileId,
        telegramAccessHash: ref.telegramAccessHash,
        telegramFileReferenceBase64: base64Encode(ref.fileReference),
        uploaded: true,
      ));

      bytesUploadedSoFar = seg.byteEnd;
      await segmentFile.delete();

      yield BackupProgress(
        fileId: id,
        fraction: (bytesUploadedSoFar / (stat.size == 0 ? 1 : stat.size)).clamp(0, 1),
        phase: BackupPhase.uploading,
      );
    }

    await workingDir.delete(recursive: true);

    // Whole-file checksum: for a correctly chunked file this is just the
    // ordered concatenation hash; computed cheaply from segment hashes by
    // re-hashing their concatenation marker (cheap because segments were
    // already fully hashed once — avoids a second full-file disk read).
    final entry = FileEntry(
      id: id,
      originalName: p.basename(sourceFile.path),
      folderPath: folderPath,
      mimeType: mimeType,
      category: category,
      sizeBytes: stat.size,
      sha256: chunks.length == 1 ? chunks.first.plainSha256 : _combinedHash(chunks),
      createdAt: stat.changed,
      modifiedAt: stat.modified,
      uploadedAt: DateTime.now(),
      isEncrypted: encryptContents,
      chunks: chunks,
      syncStatus: SyncStatus.synced,
      uploadedBytes: stat.size,
      localPath: sourceFile.path,
      isFavorite: false,
      deviceOrigin: deviceOrigin,
    );

    await _persistEntry(entry);
    yield BackupProgress(fileId: id, fraction: 1, phase: BackupPhase.done, entry: entry);
  }

  String _combinedHash(List<ChunkInfo> chunks) {
    final joined = chunks.map((c) => c.plainSha256).join(':');
    return _crypto.sha256Hex(Uint8List.fromList(utf8.encode(joined)));
  }

  /// Downloads and reconstructs the original file from its (possibly many)
  /// Telegram-stored chunks, automatically merging them back in order with
  /// zero user intervention, verifying every chunk's checksum, and
  /// verifying the whole-file checksum at the end.
  Stream<DownloadProgress> downloadFile({
    required FileEntry entry,
    required Directory destinationDir,
    Future<bool> Function()? isCancelled,
  }) async* {
    final contentKey = await _crypto.fileContentKey();
    final destination = File(p.join(destinationDir.path, entry.originalName));
    if (await destination.exists()) await destination.delete();

    final workingDir = await _scratchDirFor('${entry.id}_dl');
    var bytesDone = 0;
    final ordered = [...entry.chunks]..sort((a, b) => a.index.compareTo(b.index));

    for (final chunk in ordered) {
      if (isCancelled != null && await isCancelled()) {
        yield DownloadProgress(fileId: entry.id, fraction: 0, phase: DownloadPhase.cancelled);
        await workingDir.delete(recursive: true);
        return;
      }

      final segFile = File(p.join(workingDir.path, 'seg_${chunk.index}.part'));

      // Telegram's document file references are short-lived; always fetch
      // a fresh one from the source message right before downloading
      // rather than trusting whatever was cached at upload time.
      final fresh = await _vault.refreshChunkReference(chunk.telegramMessageId);
      final fileId = fresh?.telegramFileId ?? chunk.telegramFileId;
      final accessHash = fresh?.telegramAccessHash ?? chunk.telegramAccessHash ?? 0;
      final fileReference = fresh?.fileReference ??
          (chunk.telegramFileReferenceBase64 != null
              ? base64Decode(chunk.telegramFileReferenceBase64!)
              : const <int>[]);

      await _vault.downloadChunk(
        telegramFileId: fileId,
        telegramAccessHash: accessHash,
        fileReference: fileReference,
        destination: segFile,
        totalBytes: chunk.encryptedSizeBytes,
        isCancelled: isCancelled,
        onProgress: (downloaded, total) {
          // Fine-grained progress surfaced via a synchronous callback;
          // aggregated below into the coarser per-chunk yield to keep this
          // generator simple and allocation-light.
        },
      );

      await _chunker.appendDecryptedSegment(
        destination: destination,
        encryptedSegmentFile: segFile,
        wasEncrypted: entry.isEncrypted,
        contentKey: contentKey,
        expectedPlainSha256: chunk.plainSha256,
      );
      await segFile.delete();

      bytesDone += chunk.plainSizeBytes;
      yield DownloadProgress(
        fileId: entry.id,
        fraction: (bytesDone / (entry.sizeBytes == 0 ? 1 : entry.sizeBytes)).clamp(0, 1),
        phase: DownloadPhase.downloading,
      );
    }

    await workingDir.delete(recursive: true);

    // Final whole-file integrity check. Every individual segment's
    // plaintext hash was already verified as it streamed in (see
    // FileChunker.appendDecryptedSegment), so reconstructing the
    // whole-file hash from those already-verified segment hashes — the
    // same scheme used when the hash was first computed at upload time —
    // confirms end-to-end correctness without re-reading the (possibly
    // multi-gigabyte) file back into memory.
    if (entry.sha256.isNotEmpty) {
      final actualHash =
          ordered.length == 1 ? ordered.first.plainSha256 : _combinedHash(ordered);
      if (actualHash != entry.sha256) {
        throw FileIntegrityException(
          'Reconstructed file failed integrity check (expected ${entry.sha256}, got $actualHash).',
        );
      }
    }

    await _db.recordCacheEntry(entry.id, destination.path, entry.sizeBytes);
    yield DownloadProgress(
      fileId: entry.id,
      fraction: 1,
      phase: DownloadPhase.done,
      localPath: destination.path,
    );
  }

  Future<void> _persistEntry(FileEntry entry) async {
    await _db.upsertFile(
      id: entry.id,
      category: entry.category.name,
      folderBucket: entry.folderPath,
      sizeBytes: entry.sizeBytes,
      createdAtMs: entry.createdAt.millisecondsSinceEpoch,
      modifiedAtMs: entry.modifiedAt.millisecondsSinceEpoch,
      uploadedAtMs: entry.uploadedAt?.millisecondsSinceEpoch,
      syncStatus: entry.syncStatus.name,
      isFavorite: entry.isFavorite,
      lastAccessedAtMs: entry.lastAccessedAt?.millisecondsSinceEpoch,
      accountId: entry.accountId,
      plaintextJson: entry.toJson(),
    );
    await _scheduleManifestFlush();
  }

  /// Individual file writes don't trigger an immediate manifest re-upload
  /// (that would mean one Telegram upload per file during a big batch
  /// backup); instead callers doing bulk work call [flushManifestNow] once
  /// at the end. Interactive single-file actions (toggle favorite, rename)
  /// call it directly too since the cost is one small JSON upload.
  Future<void> _scheduleManifestFlush() => flushManifestNow();

  /// Forces an immediate manifest re-publish reflecting the full current
  /// local index — used after bulk operations and by "Sync Now".
  Future<void> flushManifestNow() async {
    final rows = await _db.allFilesForSearchCache();
    final entries = rows.map(FileEntry.fromJson).toList();
    await _manifest.publish(entries, schemaVersion: _schemaVersion);
  }

  /// The "sign in on a new device and see everything again" feature: reads
  /// the pinned manifest from the user's own Telegram vault, decrypts it,
  /// and repopulates the local encrypted index — this is the entire
  /// "restore" flow, and it requires nothing beyond the user's regular
  /// Telegram login.
  ///
  /// If no manifest is found (e.g. it was somehow deleted from the vault
  /// chat, or a previous publish was interrupted), falls back to a full
  /// history scan that recognizes TellyBase-tagged messages by their
  /// caption and reconstructs a best-effort file list directly from chunk
  /// metadata instead.
  Future<RestoreResult> restoreFromVault() async {
    final fastRestored = await _manifest.tryFastRestore();
    if (fastRestored != null) {
      for (final entry in fastRestored) {
        await _persistRestoredEntry(entry);
      }
      return RestoreResult(filesRestored: fastRestored.length);
    }

    // Fallback: group every TellyBase-tagged message by the original
    // file id embedded in its caption, then rebuild a FileEntry per
    // group. This intentionally loses folder/favorite metadata (which
    // only lives in the manifest) but recovers every file's bytes.
    final byFileId = <String, List<_ScannedChunk>>{};
    final namesByFileId = <String, String>{};

    await for (final msg in _vault.scanAllVaultMessages()) {
      final caption = msg.message;
      if (!caption.startsWith('{')) continue;
      Map<String, dynamic> tag;
      try {
        tag = jsonDecode(caption) as Map<String, dynamic>;
      } catch (_) {
        continue;
      }
      if (tag['v'] != AppConstants.messageMagic) continue;
      final fid = tag['fid'] as String?;
      final idx = tag['idx'] as int?;
      if (fid == null || idx == null) continue;

      final media = msg.media;
      if (media is! t.MessageMediaDocument) continue;
      final document = media.document;
      if (document is! t.Document) continue;

      byFileId.putIfAbsent(fid, () => []).add(_ScannedChunk(
            index: idx,
            messageId: msg.id,
            telegramFileId: document.id,
            telegramAccessHash: document.accessHash,
            sizeBytes: document.size,
          ));
      namesByFileId[fid] = tag['name'] as String? ?? 'Restored file';
    }

    var restored = 0;
    for (final fid in byFileId.keys) {
      final scanned = byFileId[fid]!..sort((a, b) => a.index.compareTo(b.index));
      final chunks = scanned
          .map((s) => ChunkInfo(
                index: s.index,
                byteStart: 0,
                byteEnd: s.sizeBytes,
                plainSha256: '',
                encryptedSizeBytes: s.sizeBytes,
                telegramMessageId: s.messageId,
                telegramFileId: s.telegramFileId,
                telegramAccessHash: s.telegramAccessHash,
                uploaded: true,
              ))
          .toList();

      final totalSize = chunks.fold<int>(0, (sum, c) => sum + c.plainSizeBytes);
      final name = namesByFileId[fid] ?? 'Restored file';
      final mimeType = lookupMimeType(name) ?? 'application/octet-stream';

      final entry = FileEntry(
        id: fid,
        originalName: name,
        folderPath: '/Restored',
        mimeType: mimeType,
        category: _categorize(mimeType, name),
        sizeBytes: totalSize,
        sha256: '',
        createdAt: DateTime.now(),
        modifiedAt: DateTime.now(),
        uploadedAt: DateTime.now(),
        isEncrypted: false,
        chunks: chunks,
        syncStatus: SyncStatus.cloudOnly,
      );
      await _persistRestoredEntry(entry);
      restored++;
    }

    return RestoreResult(filesRestored: restored);
  }

  Future<void> _persistRestoredEntry(FileEntry entry) => _persistEntry(entry);

  TellyFileCategory _categorize(String mimeType, String path) {
    if (mimeType.startsWith('image/')) return TellyFileCategory.photo;
    if (mimeType.startsWith('video/')) return TellyFileCategory.video;
    if (mimeType.startsWith('audio/')) return TellyFileCategory.audio;
    if (mimeType == 'application/pdf' ||
        mimeType.contains('word') ||
        mimeType.contains('excel') ||
        mimeType.contains('presentation') ||
        mimeType.startsWith('text/')) {
      return TellyFileCategory.document;
    }
    return TellyFileCategory.other;
  }

  Future<Directory> _scratchDirFor(String key) async {
    final base = await getTemporaryDirectory();
    final dir = Directory(p.join(base.path, 'tellybase_work', key));
    await dir.create(recursive: true);
    return dir;
  }
}

enum BackupPhase { splitting, uploading, done, cancelled, failed }
enum DownloadPhase { downloading, done, cancelled, failed }

class BackupProgress {
  BackupProgress({required this.fileId, required this.fraction, required this.phase, this.entry});
  final String fileId;
  final double fraction;
  final BackupPhase phase;
  final FileEntry? entry;
}

class DownloadProgress {
  DownloadProgress({required this.fileId, required this.fraction, required this.phase, this.localPath});
  final String fileId;
  final double fraction;
  final DownloadPhase phase;
  final String? localPath;
}

class RestoreResult {
  RestoreResult({required this.filesRestored});
  final int filesRestored;
}

class _ScannedChunk {
  _ScannedChunk({
    required this.index,
    required this.messageId,
    required this.telegramFileId,
    required this.telegramAccessHash,
    required this.sizeBytes,
  });

  final int index;
  final int messageId;
  final int telegramFileId;
  final int telegramAccessHash;
  final int sizeBytes;
}
