import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../domain/entities/album.dart';
import '../domain/entities/media_item.dart';

/// Items shown in the main gallery: not trashed, newest capture date first.
final activeItemsProvider = Provider<List<MediaItem>>((ref) {
  final items = ref.watch(libraryControllerProvider).value ?? const <MediaItem>[];
  final active = items.where((e) => !e.trashed).toList();
  active.sort((a, b) => b.displayDate.compareTo(a.displayDate));
  return active;
});

final trashedItemsProvider = Provider<List<MediaItem>>((ref) {
  final items = ref.watch(libraryControllerProvider).value ?? const <MediaItem>[];
  final trashed = items.where((e) => e.trashed).toList();
  trashed.sort((a, b) => b.displayDate.compareTo(a.displayDate));
  return trashed;
});

final favoriteItemsProvider = Provider<List<MediaItem>>((ref) {
  final items = ref.watch(activeItemsProvider);
  return items.where((e) => e.favorite).toList();
});

final albumsProvider = Provider<List<Album>>((ref) {
  return Album.fromItems(ref.watch(activeItemsProvider));
});

final albumCountProvider = Provider<int>((ref) => ref.watch(albumsProvider).length);

/// Items belonging to a given album.
final albumItemsProvider =
    Provider.family<List<MediaItem>, String>((ref, albumId) {
  return ref
      .watch(activeItemsProvider)
      .where((e) => e.albumId == albumId)
      .toList();
});

final totalStorageProvider = Provider<int>((ref) {
  final items = ref.watch(libraryControllerProvider).value ?? const <MediaItem>[];
  var total = 0;
  for (final e in items) {
    if (!e.trashed) total += e.size;
  }
  return total;
});

/// Case-insensitive full-text search over filenames.
final searchResultsProvider =
    Provider.family<List<MediaItem>, String>((ref, query) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return const [];
  return ref
      .watch(activeItemsProvider)
      .where((e) => e.fileName.toLowerCase().contains(q))
      .toList();
});
