import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/gallery_grid.dart';
import '../../gallery/presentation/item_viewer_screen.dart';
import '../../library/presentation/library_selectors.dart';

/// All favorited items.
class FavoritesScreen extends ConsumerWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(favoriteItemsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Favorites', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: items.isEmpty
          ? const EmptyState(
              icon: Icons.favorite_border,
              title: 'No favorites yet',
              subtitle: 'Tap the heart on any photo or video to add it here.',
            )
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
