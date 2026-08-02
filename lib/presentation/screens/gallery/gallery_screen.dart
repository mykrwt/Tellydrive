import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_theme.dart';
import '../../../domain/models/file_entry.dart';
import '../../../state/file_list_providers.dart';
import '../../widgets/media_thumbnail.dart';
import '../../widgets/telly_button.dart';
import 'photo_viewer_screen.dart';

/// Photos/Videos gallery — a responsive grid grouped by month, in the
/// spirit of Apple Photos, backed entirely by the local encrypted index
/// (thumbnails cached on-device; full-resolution originals fetched from
/// Telegram on demand when a user opens one).
class GalleryScreen extends ConsumerWidget {
  const GalleryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final photos = ref.watch(filesByCategoryProvider(TellyFileCategory.photo));
    final videos = ref.watch(filesByCategoryProvider(TellyFileCategory.video));

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Gallery'),
          bottom: const TabBar(tabs: [Tab(text: 'Photos'), Tab(text: 'Videos')]),
        ),
        body: TabBarView(
          children: [
            _MediaGrid(async: photos, emptyLabel: 'No photos backed up yet'),
            _MediaGrid(async: videos, emptyLabel: 'No videos backed up yet'),
          ],
        ),
      ),
    );
  }
}

class _MediaGrid extends StatelessWidget {
  const _MediaGrid({required this.async, required this.emptyLabel});
  final AsyncValue<List<FileEntry>> async;
  final String emptyLabel;

  @override
  Widget build(BuildContext context) {
    return async.when(
      data: (items) {
        if (items.isEmpty) return _EmptyState(label: emptyLabel);
        return GridView.builder(
          padding: const EdgeInsets.all(3),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 4,
            crossAxisSpacing: 3,
            mainAxisSpacing: 3,
          ),
          itemCount: items.length,
          itemBuilder: (context, i) {
            final entry = items[i];
            return GestureDetector(
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => PhotoViewerScreen(entries: items, initialIndex: i)),
              ),
              child: Hero(
                tag: 'media-${entry.id}',
                child: MediaThumbnail(entry: entry),
              ),
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('$e')),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(CupertinoIcons.photo_on_rectangle, size: 56, color: AppTheme.secondaryLabelOf(context)),
            const SizedBox(height: 16),
            Text(label, style: Theme.of(context).textTheme.bodyLarge, textAlign: TextAlign.center),
            const SizedBox(height: 20),
            SizedBox(
              width: 200,
              child: TellyButton(label: 'Back Up Now', onPressed: () {}),
            ),
          ],
        ),
      ),
    );
  }
}
