import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/constants/app_constants.dart';
import '../domain/models/file_entry.dart';
import 'app_providers.dart';

/// Riverpod providers exposing the local encrypted index as ready-to-render
/// [FileEntry] lists for each screen. All of these read from
/// [LocalDatabase] (via [fileRepositoryProvider]'s underlying db) — never
/// directly from Telegram — so scrolling the UI is instant even offline;
/// Telegram is only touched when a file's bytes are actually needed.
final localDatabaseInstanceProvider = FutureProvider((ref) async {
  return ref.watch(localDatabaseProvider.future);
});

final allFilesProvider = FutureProvider<List<FileEntry>>((ref) async {
  final db = await ref.watch(localDatabaseProvider.future);
  final rows = await db.allFilesForSearchCache();
  return rows.map(FileEntry.fromJson).toList();
});

final filesByCategoryProvider = FutureProvider.family<List<FileEntry>, TellyFileCategory>((ref, category) async {
  final db = await ref.watch(localDatabaseProvider.future);
  final rows = await db.listFilesByCategory(category.name);
  return rows.map(FileEntry.fromJson).toList();
});

final favoritesProvider = FutureProvider<List<FileEntry>>((ref) async {
  final db = await ref.watch(localDatabaseProvider.future);
  final rows = await db.listFavorites();
  return rows.map(FileEntry.fromJson).toList();
});

final recentFilesProvider = FutureProvider<List<FileEntry>>((ref) async {
  final db = await ref.watch(localDatabaseProvider.future);
  final rows = await db.listRecent();
  return rows.map(FileEntry.fromJson).toList();
});

final storageStatsProvider = FutureProvider<StorageStats>((ref) async {
  final db = await ref.watch(localDatabaseProvider.future);
  final total = await db.totalStoredBytes();
  final byCategoryRaw = await db.storageByCategory();
  final byCategory = <TellyFileCategory, int>{
    for (final cat in TellyFileCategory.values) cat: byCategoryRaw[cat.name] ?? 0,
  };
  return StorageStats(totalBytes: total, byCategory: byCategory);
});

class StorageStats {
  StorageStats({required this.totalBytes, required this.byCategory});
  final int totalBytes;
  final Map<TellyFileCategory, int> byCategory;
}
