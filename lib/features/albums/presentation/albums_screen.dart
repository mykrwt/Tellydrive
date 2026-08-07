import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/thumbnail.dart';
import '../../library/domain/entities/album.dart';
import '../../library/presentation/library_selectors.dart';
import 'album_detail_screen.dart';

/// Grid of albums derived from item metadata (no separate backend structure).
class AlbumsScreen extends ConsumerWidget {
  const AlbumsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final albums = ref.watch(albumsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Albums',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: albums.isEmpty
          ? const EmptyState(
              icon: Icons.photo_album_outlined,
              title: 'No albums yet',
              subtitle: 'Organise photos and videos into albums from the viewer.',
            )
          : GridView.builder(
              padding: const EdgeInsets.all(12),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.95,
              ),
              itemCount: albums.length,
              itemBuilder: (context, i) => _AlbumCard(album: albums[i]),
            ),
    );
  }
}

class _AlbumCard extends ConsumerWidget {
  const _AlbumCard({required this.album});

  final Album album;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(albumItemsProvider(album.id));
    final cover = items.isEmpty ? null : items.first;

    return InkWell(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => AlbumDetailScreen(album: album),
        ),
      ),
      borderRadius: BorderRadius.circular(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: cover == null
                  ? Container(color: Theme.of(context).colorScheme.surfaceContainerHighest)
                  : Thumbnail(item: cover),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            album.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(fontWeight: FontWeight.w600),
          ),
          Text(
            '${album.itemCount} items',
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
