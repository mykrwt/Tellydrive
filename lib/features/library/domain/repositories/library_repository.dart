import 'dart:io';

import '../../../../telegram/core/telegram_storage.dart';
import '../entities/media_item.dart';

/// The gallery's data contract. Implementations back onto Telegram storage plus
/// a local on-device cache; callers never see the transport.
abstract interface class LibraryRepository {
  /// Rebuilds the library from Telegram history and caches it locally.
  Future<List<MediaItem>> sync();

  /// Returns the cached index immediately (empty before the first sync).
  Future<List<MediaItem>> cachedIndex();

  /// Uploads a file as a new library item.
  Future<MediaItem> upload({
    required MediaItem item,
    required String filePath,
    ProgressCallback? onProgress,
  });

  /// Downloads an item's original bytes to [destinationDir] (or the device
  /// downloads folder when omitted).
  Future<File> download(
    MediaItem item, {
    String? destinationDir,
    ProgressCallback? onProgress,
  });

  Future<void> setFavorite(MediaItem item, bool value);
  Future<void> setTrashed(MediaItem item, bool value);
  Future<void> setAlbum(MediaItem item, {required String? albumId, required String? albumName});
  Future<void> permanentlyDelete(List<MediaItem> items);
}
