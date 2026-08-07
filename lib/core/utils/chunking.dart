import '../../core/config/app_config.dart';
import '../../core/error/app_exception.dart';

/// Computes the [0..N) byte ranges used to split a large file into chunks that
/// each fit inside a single Telegram document message.
class ChunkingPlan {
  const ChunkingPlan._({
    required this.chunkCount,
    required this.chunkSize,
    required this.totalSize,
  });

  /// Number of chunks the file will be split into.
  final int chunkCount;

  /// Bytes per chunk (the last chunk may be smaller).
  final int chunkSize;

  /// Total logical file size in bytes.
  final int totalSize;

  static const int _minSizeForChunking = 4 * 1024 * 1024; // 4 MiB

  /// Builds a plan for [totalSize] bytes. Small files are sent as a single
  /// chunk; larger files are split so no chunk exceeds [chunkSize].
  static ChunkingPlan forSize(
    int totalSize, {
    int chunkSize = AppConfig.chunkSize,
  }) {
    if (totalSize < 0) {
      throw const AppException('File size cannot be negative.');
    }
    if (chunkSize <= 0) {
      throw const AppException('Chunk size must be positive.');
    }
    // Keep the smallest single chunk >= _minSizeForChunking so we don't spam
    // Telegram with many tiny messages for small files.
    if (totalSize <= _minSizeForChunking || totalSize <= chunkSize) {
      return ChunkingPlan._(chunkCount: 1, chunkSize: totalSize, totalSize: totalSize);
    }
    final count = (totalSize / chunkSize).ceil();
    if (count > AppConfig.maxChunksPerFile) {
      throw ChunkedFileException(
        'File is too large to chunk (would need $count chunks).',
      );
    }
    return ChunkingPlan._(chunkCount: count, chunkSize: chunkSize, totalSize: totalSize);
  }

  /// Byte range (start inclusive, end exclusive) for chunk [index].
  ({int start, int end}) rangeFor(int index) {
    if (index < 0 || index >= chunkCount) {
      throw ChunkedFileException('Chunk index $index out of range.');
    }
    final start = index * chunkSize;
    final end = index == chunkCount - 1 ? totalSize : (start + chunkSize);
    return (start: start, end: end);
  }

  /// The number of bytes actually present in chunk [index].
  int sizeFor(int index) {
    final r = rangeFor(index);
    return r.end - r.start;
  }
}
