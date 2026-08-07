import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tellybase_mobile/core/di/providers.dart';
import 'package:tellybase_mobile/core/widgets/app_logo.dart';
import 'package:tellybase_mobile/core/widgets/empty_state.dart';
import 'package:tellybase_mobile/features/dashboard/presentation/controllers/dashboard_controller.dart';
import 'package:tellybase_mobile/features/dashboard/presentation/widgets/storage_overview_card.dart';
import 'package:tellybase_mobile/features/gallery/presentation/widgets/media_tile.dart';
import 'package:tellybase_mobile/features/gallery/presentation/widgets/media_viewer.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_file.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/file_page.dart';
import 'package:tellybase_mobile/features/storage/presentation/controllers/gallery_controller.dart';
import 'package:tellybase_mobile/features/storage/presentation/controllers/upload_controller.dart';
import 'package:tellybase_mobile/features/storage/presentation/widgets/upload_queue_sheet.dart';

class GalleryScreen extends ConsumerStatefulWidget {
  const GalleryScreen({super.key});

  @override
  ConsumerState<GalleryScreen> createState() => _GalleryScreenState();
}

class _GalleryScreenState extends ConsumerState<GalleryScreen> {
  final _scroll = ScrollController();
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll
      ..removeListener(_onScroll)
      ..dispose();
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(galleryControllerProvider);
    final controller = ref.read(galleryControllerProvider.notifier);
    final summary = ref.watch(dashboardSummaryProvider);
    final hasSelection = state.selected.isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        title: hasSelection
            ? Text('${state.selected.length} selected')
            : const AppLogo(compact: true),
        actions: hasSelection
            ? [
                IconButton(
                  tooltip: 'Download selected',
                  onPressed: () => _downloadSelected(
                    state.files
                        .where((file) => state.selected.contains(file.id))
                        .toList(growable: false),
                  ),
                  icon: const Icon(Icons.download_outlined),
                ),
                IconButton(
                  tooltip: 'Delete selected',
                  onPressed: () => _deleteSelected(controller),
                  icon: const Icon(Icons.delete_outline_rounded),
                ),
                IconButton(
                  tooltip: 'Clear selection',
                  onPressed: controller.clearSelection,
                  icon: const Icon(Icons.close_rounded),
                ),
              ]
            : [
                IconButton(
                  tooltip: state.usesGrid ? 'List view' : 'Grid view',
                  onPressed: controller.toggleView,
                  icon: Icon(
                    state.usesGrid
                        ? Icons.view_agenda_outlined
                        : Icons.grid_view_rounded,
                  ),
                ),
                IconButton(
                  tooltip: 'Transfers',
                  onPressed: () => UploadQueueSheet.show(context),
                  icon: const Icon(Icons.swap_vert_circle_outlined),
                ),
              ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _pickUploads,
        icon: const Icon(Icons.add_photo_alternate_outlined),
        label: const Text('Add media'),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await controller.load(refresh: true);
          ref.invalidate(dashboardSummaryProvider);
        },
        child: CustomScrollView(
          controller: _scroll,
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 4),
              sliver: SliverList.list(
                children: [
                  Text('Your moments, beautifully private.', style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 8),
                  Text(
                    'Photos and videos are organized by day and protected by your private cloud session.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 20),
                  summary.when(
                    data: (value) => StorageOverviewCard(summary: value),
                    loading: () => const SizedBox(
                      height: 116,
                      child: Center(child: CircularProgressIndicator()),
                    ),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                  const SizedBox(height: 18),
                  TextField(
                    controller: _search,
                    onChanged: controller.setSearch,
                    decoration: InputDecoration(
                      hintText: 'Search your gallery',
                      prefixIcon: const Icon(Icons.search_rounded),
                      suffixIcon: _search.text.isEmpty
                          ? null
                          : IconButton(
                              onPressed: () {
                                _search.clear();
                                controller.setSearch('');
                                setState(() {});
                              },
                              icon: const Icon(Icons.close_rounded),
                            ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: MediaFilter.values.map((filter) {
                        final label = switch (filter) {
                          MediaFilter.all => 'All',
                          MediaFilter.images => 'Photos',
                          MediaFilter.videos => 'Videos',
                          MediaFilter.favorites => 'Favorites',
                        };
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(label),
                            selected: state.filter == filter,
                            onSelected: (_) => controller.setFilter(filter),
                          ),
                        );
                      }).toList(growable: false),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Text(
                        '${state.total} ${state.total == 1 ? 'moment' : 'moments'}',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const Spacer(),
                      PopupMenuButton<FileSort>(
                        initialValue: state.sort,
                        onSelected: controller.setSort,
                        itemBuilder: (_) => const [
                          PopupMenuItem(value: FileSort.dateNewest, child: Text('Newest first')),
                          PopupMenuItem(value: FileSort.dateOldest, child: Text('Oldest first')),
                          PopupMenuItem(value: FileSort.nameAscending, child: Text('Name')),
                          PopupMenuItem(value: FileSort.sizeDescending, child: Text('Largest first')),
                        ],
                        child: const Row(
                          children: [
                            Icon(Icons.sort_rounded, size: 19),
                            SizedBox(width: 5),
                            Text('Sort'),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  if (state.error != null)
                    _InlineError(
                      message: state.error!,
                      onRetry: controller.load,
                    ),
                ],
              ),
            ),
            if (state.isLoading && state.files.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(child: CircularProgressIndicator()),
              )
            else if (state.files.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: EmptyState(
                  icon: Icons.photo_library_outlined,
                  title: state.search.isEmpty ? 'Your gallery is ready' : 'No moments found',
                  message: state.search.isEmpty
                      ? 'Add photos or videos to begin your private timeline.'
                      : 'Try another search or filter.',
                  action: state.search.isEmpty
                      ? FilledButton.icon(
                          onPressed: _pickUploads,
                          icon: const Icon(Icons.add_rounded),
                          label: const Text('Add your first moment'),
                        )
                      : null,
                ),
              )
            else if (state.usesGrid)
              ..._gallerySections(state.files, state.selected, controller)
            else
              SliverList.builder(
                itemCount: state.files.length,
                itemBuilder: (context, index) => MediaTile(
                  file: state.files[index],
                  grid: false,
                  selected: state.selected.contains(state.files[index].id),
                  onTap: () => _tapFile(index, state, controller),
                  onLongPress: () => controller.toggleSelection(state.files[index].id),
                ),
              ),
            if (state.isLoadingMore)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
            const SliverToBoxAdapter(child: SizedBox(height: 100)),
          ],
        ),
      ),
    );
  }

  List<Widget> _gallerySections(
    List<CloudFile> files,
    Set<String> selected,
    GalleryController controller,
  ) {
    final groups = <DateTime, List<(int, CloudFile)>>{};
    for (var index = 0; index < files.length; index += 1) {
      final file = files[index];
      final local = file.createdAt.toLocal();
      final key = DateTime(local.year, local.month, local.day);
      groups.putIfAbsent(key, () => []).add((index, file));
    }
    return groups.entries.expand((entry) {
      final today = DateTime.now();
      final day = DateTime(today.year, today.month, today.day);
      final difference = day.difference(entry.key).inDays;
      final title = difference == 0
          ? 'Today'
          : difference == 1
              ? 'Yesterday'
              : MaterialLocalizations.of(context).formatMediumDate(entry.key);
      return <Widget>[
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 10),
          sliver: SliverToBoxAdapter(
            child: Text(title, style: Theme.of(context).textTheme.titleMedium),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 18),
          sliver: SliverLayoutBuilder(
            builder: (context, constraints) {
              final count = constraints.crossAxisExtent >= 700 ? 4 : constraints.crossAxisExtent >= 480 ? 3 : 2;
              return SliverGrid.builder(
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: count,
                  mainAxisSpacing: 11,
                  crossAxisSpacing: 11,
                  childAspectRatio: 0.84,
                ),
                itemCount: entry.value.length,
                itemBuilder: (context, localIndex) {
                  final (globalIndex, file) = entry.value[localIndex];
                  return MediaTile(
                    file: file,
                    selected: selected.contains(file.id),
                    onTap: () => _tapFile(
                      globalIndex,
                      ref.read(galleryControllerProvider),
                      controller,
                    ),
                    onLongPress: () => controller.toggleSelection(file.id),
                  );
                },
              );
            },
          ),
        ),
      ];
    }).toList(growable: false);
  }

  Future<void> _deleteSelected(GalleryController controller) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete selected media?'),
        content: const Text('This removes the selected items from your private storage.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await controller.deleteSelected();
      ref.invalidate(dashboardSummaryProvider);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Some items could not be deleted.')));
      }
    }
  }

  Future<void> _downloadSelected(List<CloudFile> files) async {
    for (final file in files) {
      await _downloadMedia(file, openAfterDownload: false);
    }
  }

  Future<void> _downloadMedia(
    CloudFile file, {
    bool openAfterDownload = true,
  }) async {
    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(SnackBar(content: Text('Downloading ${file.name}…')));
    try {
      final device = ref.read(deviceFileServiceProvider);
      final path = await device.createDownloadPath(file.name);
      await ref.read(cloudStorageRepositoryProvider).downloadFile(
            id: file.id,
            destinationPath: path,
          );
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(SnackBar(content: Text('${file.name} is ready')));
      if (openAfterDownload) await device.open(path);
    } catch (error) {
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  Future<void> _pickUploads() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'mp4', 'mov', 'm4v', 'webm', 'mkv'],
    );
    if (result == null || result.files.isEmpty || !mounted) return;
    final task = ref.read(uploadControllerProvider.notifier).uploadFiles(
          result.files,
          source: 'gallery',
        );
    unawaited(UploadQueueSheet.show(context));
    final completed = await task;
    if (!mounted) return;
    if (completed > 0) {
      await ref.read(galleryControllerProvider.notifier).load(refresh: true);
      ref.invalidate(dashboardSummaryProvider);
    }
  }

  void _tapFile(int index, GalleryState state, GalleryController controller) {
    final file = state.files[index];
    if (state.selected.isNotEmpty) {
      controller.toggleSelection(file.id);
      return;
    }
    Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => MediaViewer(
          files: state.files,
          initialIndex: index,
          onDownload: (file) => _downloadMedia(file),
          onFavorite: controller.setFavorite,
        ),
      ),
    );
  }

  void _onScroll() {
    if (_scroll.position.extentAfter < 600) {
      unawaited(ref.read(galleryControllerProvider.notifier).loadMore());
    }
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.error.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Icon(Icons.cloud_off_rounded, color: Theme.of(context).colorScheme.error),
          const SizedBox(width: 10),
          Expanded(child: Text(message)),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
