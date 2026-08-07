import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/gallery_grid.dart';
import '../../gallery/presentation/item_viewer_screen.dart';
import '../../library/domain/entities/album.dart';
import '../../library/presentation/library_selectors.dart';

/// All items belonging to one album, shown in the same date-grouped grid.
class AlbumDetailScreen extends ConsumerWidget {
  const AlbumDetailScreen({super.key, required this.album});

  final Album album;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(albumItemsProvider(album.id));

    return Scaffold(
      appBar: AppBar(
        title: Text(
          album.name,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.more_vert),
            onPressed: () {},
          ),
        ],
      ),
      body: items.isEmpty
          ? const Center(child: Text('Album is empty'))
          : GalleryGrid(
              items: items,
              onItemTap: (item, index) {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) =>
                        ItemViewerScreen(items: items, initialIndex: index),
                  ),
                );
              },
            ),
    );
  }
}
