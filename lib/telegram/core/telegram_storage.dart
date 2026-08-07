import 'dart:io';

import '../../features/library/domain/entities/media_item.dart';

/// Progress callback receiving (doneBytes, totalBytes).
typedef ProgressCallback = void Function(int done, int total);

/// The storage half of the Telegram engine. Everything lives in the user's
/// own Saved Messages chat; chunks and metadata are handled transparently.
abstract interface class TelegramStorage {
  /// Uploads [localFilePath] as a new library item.
  ///
  /// Splits large files into multiple Telegram documents, writes the metadata
  /// caption on chunk 0 and the chunk manifest after all parts are sent.
  /// Returns the created [MediaItem] (now carrying chunk message ids).
  Future<MediaItem> uploadItem({
    required MediaItem item,
    required String localFilePath,
    ProgressCallback? onProgress,
  });

  /// Downloads an item's original bytes (concatenating chunks if needed) into
  /// [destinationDir] under its original filename. Returns the written file.
  Future<File> downloadItem({
    required MediaItem item,
    required String destinationDir,
    ProgressCallback? onProgress,
  });

  /// Streams a single chunk's bytes to a sink (used by the local cache).
  Future<void> streamChunk({
    required int messageId,
    required Sink<List<int>> sink,
    ProgressCallback? onProgress,
  });

  /// Rebuilds the library by walking Saved Messages history and decoding
  /// metadata captions. Items are returned newest-first.
  Future<List<MediaItem>> syncHistory();

  /// Persists a metadata change (favorite / trash / album / caption edits) by
  /// editing chunk 0's caption in Telegram.
  Future<void> updateItem(MediaItem item);

  /// Deletes items. When [permanently] is false the item is only marked trashed
  /// via `updateItem`; when true the underlying chunk messages are deleted.
  Future<void> deleteItems({
    required List<MediaItem> items,
    required bool permanently,
  });
}
