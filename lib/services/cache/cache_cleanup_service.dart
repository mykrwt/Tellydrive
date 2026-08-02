import 'dart:io';

import '../../core/constants/app_constants.dart';
import '../../data/local_db/local_database.dart';

/// Implements "automatic cleanup of local cached files" and the "offline
/// cache of recently accessed files" size/TTL policy: files that were
/// downloaded on-demand for viewing are kept locally for fast repeat
/// access, but are evicted (oldest-accessed first) once the cache exceeds
/// [AppConstants.defaultOfflineCacheLimitBytes] or a single entry exceeds
/// [AppConstants.cacheEntryTtl] — since the authoritative copy always
/// remains safely in the user's Telegram vault, deleting the local cache
/// copy is 100% safe and just means the next open re-downloads it.
class CacheCleanupService {
  CacheCleanupService(this._db);

  final LocalDatabase _db;

  Future<CleanupReport> runCleanup({
    int limitBytes = AppConstants.defaultOfflineCacheLimitBytes,
  }) async {
    var freedBytes = 0;
    var filesRemoved = 0;

    final entries = await _db.allCacheEntriesOldestFirst();
    var totalBytes = await _db.totalCacheBytes();

    for (final entry in entries) {
      final cachedAtMs = entry['cached_at'] as int;
      final cachedAt = DateTime.fromMillisecondsSinceEpoch(cachedAtMs);
      final isExpired = DateTime.now().difference(cachedAt) > AppConstants.cacheEntryTtl;
      final overBudget = totalBytes > limitBytes;

      if (!isExpired && !overBudget) continue;

      final path = entry['local_path'] as String;
      final size = entry['size_bytes'] as int;
      final file = File(path);
      if (await file.exists()) {
        await file.delete();
      }
      await _db.removeCacheEntry(entry['file_id'] as String);

      freedBytes += size;
      totalBytes -= size;
      filesRemoved++;
    }

    return CleanupReport(filesRemoved: filesRemoved, bytesFreed: freedBytes);
  }
}

class CleanupReport {
  CleanupReport({required this.filesRemoved, required this.bytesFreed});
  final int filesRemoved;
  final int bytesFreed;
}
