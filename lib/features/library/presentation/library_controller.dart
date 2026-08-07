import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:uuid/uuid.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/app_exception.dart';
import '../../../core/transfers/transfer_controller.dart';
import '../../../telegram/core/telegram_storage.dart';
import '../domain/entities/media_item.dart';
import '../domain/repositories/library_repository.dart';

/// Holds the full media library and exposes mutation operations. The index is
/// loaded from the local cache immediately, then refreshed from Telegram.
class LibraryController extends AsyncNotifier<List<MediaItem>> {
  LibraryRepository get _repo => ref.read(libraryRepositoryProvider);

  static final _uuid = Uuid();

  @override
  Future<List<MediaItem>> build() async {
    final cached = await _repo.cachedIndex();
    // Fire a background refresh so the UI shows instantly then syncs.
    Future.microtask(syncFromTelegram);
    return cached;
  }

  /// Rebuilds the library from Telegram history.
  Future<void> syncFromTelegram() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_repo.sync);
  }

  /// Uploads a local file into the vault as a new item.
  Future<MediaItem> addFile(
    String filePath, {
    DateTime? capturedAt,
    String? albumId,
    String? albumName,
    ProgressCallback? onProgress,
  }) async {
    final file = File(filePath);
    if (!await file.exists()) {
      throw LocalStorageException('File not found: $filePath');
    }
    final fileName = p.basename(filePath);
    final size = await file.length();
    final item = MediaItem(
      id: _uuid.v4(),
      fileName: fileName,
      mimeType: _mimeFor(fileName),
      size: size,
      uploadedAt: DateTime.now(),
      capturedAt: capturedAt,
      albumId: albumId,
      albumName: albumName,
      chunkMessageIds: const [],
      firstMessageId: 0,
    );

    final transfers = ref.read(transferControllerProvider.notifier);
    transfers.enqueueUpload(id: item.id, fileName: fileName, total: size);
    transfers.setRunning(item.id);
    ProgressCallback? track;
    if (onProgress != null) {
      track = (done, total) {
        transfers.progress(item.id, done, total);
        onProgress(done, total);
      };
    }

    try {
      final uploaded = await _repo.upload(
        item: item,
        filePath: filePath,
        onProgress: track ?? (d, t) => transfers.progress(item.id, d, t),
      );
      transfers.complete(item.id);
      return _absorb(uploaded);
    } on Object catch (e) {
      transfers.fail(item.id, e);
      rethrow;
    }
  }

  MediaItem _absorb(MediaItem uploaded) {
    final current = [...state.value ?? const <MediaItem>[]];
    if (current.any((e) => e.id == uploaded.id)) return uploaded;
    current.insert(0, uploaded);
    state = AsyncData(current);
    return uploaded;
  }

  Future<File> download(
    MediaItem item, {
    String? destinationDir,
    ProgressCallback? onProgress,
  }) async {
    final transfers = ref.read(transferControllerProvider.notifier);
    transfers.enqueueDownload(id: item.id, fileName: item.fileName, total: item.size);
    transfers.setRunning(item.id);
    try {
      final file = await _repo.download(
        item,
        destinationDir: destinationDir,
        onProgress: onProgress == null
            ? (d, t) => transfers.progress(item.id, d, t)
            : (d, t) {
                transfers.progress(item.id, d, t);
                onProgress(d, t);
              },
      );
      transfers.complete(item.id);
      return file;
    } on Object catch (e) {
      transfers.fail(item.id, e);
      rethrow;
    }
  }

  Future<void> toggleFavorite(MediaItem item) async {
    final updated = item.copyWith(favorite: !item.favorite);
    await _repo.setFavorite(item, updated.favorite);
    _replace(updated);
  }

  Future<void> trash(MediaItem item) async {
    final updated = item.copyWith(trashed: true);
    await _repo.setTrashed(item, true);
    _replace(updated);
  }

  Future<void> trashMany(List<MediaItem> items) async {
    for (final item in items) {
      await trash(item);
    }
  }

  Future<void> restore(MediaItem item) async {
    final updated = item.copyWith(trashed: false);
    await _repo.setTrashed(item, false);
    _replace(updated);
  }

  Future<void> permanentlyDelete(List<MediaItem> items) async {
    await _repo.permanentlyDelete(items);
    final ids = items.map((e) => e.id).toSet();
    final current = [...state.value ?? const <MediaItem>[]];
    current.removeWhere((e) => ids.contains(e.id));
    state = AsyncData(current);
  }

  Future<void> addToAlbum(
    MediaItem item, {
    required String albumId,
    required String albumName,
  }) async {
    final updated = item.copyWith(albumId: albumId, albumName: albumName);
    await _repo.setAlbum(item, albumId: albumId, albumName: albumName);
    _replace(updated);
  }

  Future<void> removeFromAlbum(MediaItem item) async {
    final updated = item.copyWith(albumId: null, albumName: null);
    await _repo.setAlbum(item, albumId: null, albumName: null);
    _replace(updated);
  }

  Future<void> reset() async {
    state = const AsyncData([]);
  }

  void _replace(MediaItem updated) {
    final current = [...state.value ?? const <MediaItem>[]];
    state = AsyncData(
      current.map((e) => e.id == updated.id ? updated : e).toList(),
    );
  }

  String _mimeFor(String fileName) {
    final ext = p.extension(fileName).toLowerCase();
    const map = <String, String>{
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic',
      '.heif': 'image/heif', '.bmp': 'image/bmp', '.tiff': 'image/tiff',
      '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
      '.webm': 'video/webm', '.3gp': 'video/3gpp', '.3gpp': 'video/3gpp',
      '.avi': 'video/avi', '.m4v': 'video/mp4', '.mpeg': 'video/mpeg',
    };
    return map[ext] ?? 'application/octet-stream';
  }
}
