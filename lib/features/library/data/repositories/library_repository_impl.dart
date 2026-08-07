import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../../../core/storage/index_cache.dart';
import '../../../../telegram/core/telegram_storage.dart';
import '../../domain/entities/media_item.dart';
import '../../domain/repositories/library_repository.dart';

/// [LibraryRepository] backed by [TelegramStorage] + [IndexCache] + [MediaCache].
class LibraryRepositoryImpl implements LibraryRepository {
  LibraryRepositoryImpl({required TelegramStorage storage})
      : _storage = storage;

  final TelegramStorage _storage;

  @override
  Future<List<MediaItem>> cachedIndex() => IndexCache.instance.read();

  @override
  Future<List<MediaItem>> sync() async {
    final items = await _storage.syncHistory();
    await IndexCache.instance.write(items);
    return items;
  }

  @override
  Future<MediaItem> upload({
    required MediaItem item,
    required String filePath,
    ProgressCallback? onProgress,
  }) async {
    final uploaded = await _storage.uploadItem(
      item: item,
      localFilePath: filePath,
      onProgress: onProgress,
    );
    final index = await IndexCache.instance.read();
    index.insert(0, uploaded);
    await IndexCache.instance.write(index);
    return uploaded;
  }

  @override
  Future<File> download(
    MediaItem item, {
    String? destinationDir,
    ProgressCallback? onProgress,
  }) async {
    final dir = destinationDir ?? await _defaultDownloadsDir();
    return _storage.downloadItem(
      item: item,
      destinationDir: dir,
      onProgress: onProgress,
    );
  }

  Future<String> _defaultDownloadsDir() async {
    final app = await getApplicationDocumentsDirectory();
    final dir = Directory(p.join(app.path, 'downloads'));
    await dir.create(recursive: true);
    return dir.path;
  }

  @override
  Future<void> setFavorite(MediaItem item, bool value) async {
    await _update(item.copyWith(favorite: value));
  }

  @override
  Future<void> setTrashed(MediaItem item, bool value) async {
    await _update(item.copyWith(trashed: value));
  }

  @override
  Future<void> setAlbum(
    MediaItem item, {
    required String? albumId,
    required String? albumName,
  }) async {
    await _update(item.copyWith(albumId: albumId, albumName: albumName));
  }

  Future<void> _update(MediaItem updated) async {
    await _storage.updateItem(updated);
    final index = await IndexCache.instance.read();
    final replaced = index
        .map((e) => e.id == updated.id ? updated : e)
        .toList();
    await IndexCache.instance.write(replaced);
  }

  @override
  Future<void> permanentlyDelete(List<MediaItem> items) async {
    await _storage.deleteItems(items: items, permanently: true);
    final index = await IndexCache.instance.read();
    final ids = items.map((e) => e.id).toSet();
    final kept = index.where((e) => !ids.contains(e.id)).toList();
    await IndexCache.instance.write(kept);
  }
}
