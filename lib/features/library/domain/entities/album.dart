import 'package:flutter/foundation.dart';

import 'media_item.dart';

/// An album is a lightweight grouping derived from the `albumId`/`albumName`
/// fields on items — no separate backend structure is required.
@immutable
class Album {
  const Album({required this.id, required this.name, required this.itemCount});

  final String id;
  final String name;
  final int itemCount;

  /// Builds albums from a set of items, skipping trashed ones.
  static List<Album> fromItems(Iterable<MediaItem> items) {
    final byId = <String, ({String name, int count})>{};
    for (final item in items) {
      final albumId = item.albumId;
      if (albumId == null || item.trashed) continue;
      final existing = byId[albumId];
      byId[albumId] = (
        name: existing?.name ?? item.albumName ?? 'Untitled',
        count: (existing?.count ?? 0) + 1,
      );
    }
    final albums = byId.entries
        .map((e) => Album(id: e.key, name: e.value.name, itemCount: e.value.count))
        .toList()
      ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return albums;
  }
}
