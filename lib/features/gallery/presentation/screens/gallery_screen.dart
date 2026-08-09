import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

import '../../../drive/domain/entities/drive_file.dart';
import '../../../drive/presentation/providers/drive_provider.dart';
import '../../../../services/files/file_action_service.dart';
import '../providers/gallery_provider.dart';
import 'gallery_viewer_screen.dart';

class GalleryScreen extends ConsumerStatefulWidget {
  const GalleryScreen({super.key});

  @override
  ConsumerState<GalleryScreen> createState() => _GalleryScreenState();
}

class _GalleryScreenState extends ConsumerState<GalleryScreen> {
  final Set<String> _selected = {};
  bool _busy = false;

  String _key(DriveFile file) => '${file.folderId}:${file.id}';

  String _sectionLabel(DateTime value) {
    final date = DateTime(value.year, value.month, value.day);
    final today = DateTime.now();
    final todayDate = DateTime(today.year, today.month, today.day);
    if (date == todayDate) return 'Today';
    if (date == todayDate.subtract(const Duration(days: 1))) return 'Yesterday';
    return DateFormat('MMMM d, yyyy').format(value);
  }

  Map<String, List<DriveFile>> _groups(List<DriveFile> media) {
    final result = <String, List<DriveFile>>{};
    for (final file in media) {
      result.putIfAbsent(_sectionLabel(file.uploadedAt), () => []).add(file);
    }
    return result;
  }

  void _toggle(DriveFile file) {
    setState(() {
      final key = _key(file);
      if (!_selected.add(key)) _selected.remove(key);
    });
  }

  List<DriveFile> _selectedFiles(List<DriveFile> media) =>
      media.where((file) => _selected.contains(_key(file))).toList();

  Future<void> _delete(List<DriveFile> files) async {
    if (files.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(files.length == 1 ? 'Delete this item?' : 'Delete ${files.length} items?'),
        content: const Text('This permanently deletes the Telegram messages and cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _busy = true);
    try {
      await ref.read(galleryProvider.notifier).delete(files);
      if (mounted) setState(_selected.clear);
    } catch (error) {
      if (mounted) _showError(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _download(List<DriveFile> files) async {
    if (files.isEmpty) return;
    setState(() => _busy = true);
    try {
      final repository = ref.read(driveRepositoryProvider);
      for (final file in files) {
        await FileActionService.downloadToDevice(repository, file);
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(files.length == 1 ? 'Saved to Downloads/TeleDrive' : '${files.length} items saved to Downloads/TeleDrive')),
        );
      }
    } catch (error) {
      if (mounted) _showError(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _share(List<DriveFile> files) async {
    if (files.isEmpty) return;
    setState(() => _busy = true);
    try {
      final repository = ref.read(driveRepositoryProvider);
      final paths = <XFile>[];
      for (final file in files) {
        var path = file.localPath;
        if (path == null || path.isEmpty || !await File(path).exists()) {
          path = await repository.downloadFile(file: file);
        }
        paths.add(XFile(path));
      }
      await SharePlus.instance.share(ShareParams(files: paths));
    } catch (error) {
      if (mounted) _showError(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showError(Object error) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error.toString()), backgroundColor: Colors.red),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(galleryProvider);
    final groups = _groups(state.media);
    final selectedFiles = _selectedFiles(state.media);
    final selectionMode = _selected.isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        title: selectionMode
            ? Text('${_selected.length} Selected')
            : const Text('Gallery', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
        leading: selectionMode
            ? IconButton(icon: const Icon(Icons.close), onPressed: () => setState(_selected.clear))
            : null,
        actions: [
          if (!selectionMode)
            TextButton(
              onPressed: state.media.isEmpty
                  ? null
                  : () => setState(() => _selected.addAll(state.media.map(_key))),
              child: const Text('Select'),
            )
          else
            TextButton(
              onPressed: () => setState(() {
                if (_selected.length == state.media.length) {
                  _selected.clear();
                } else {
                  _selected.addAll(state.media.map(_key));
                }
              }),
              child: Text(_selected.length == state.media.length ? 'Deselect All' : 'Select All'),
            ),
        ],
      ),
      body: Stack(
        children: [
          RefreshIndicator(
            onRefresh: ref.read(galleryProvider.notifier).refresh,
            child: state.isLoading && state.media.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : state.error != null && state.media.isEmpty
                    ? ListView(children: [
                        const SizedBox(height: 160),
                        const Icon(Icons.cloud_off_outlined, size: 54),
                        const SizedBox(height: 12),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 30),
                          child: Text(state.error!, textAlign: TextAlign.center),
                        ),
                      ])
                    : state.media.isEmpty
                        ? ListView(children: const [
                            SizedBox(height: 180),
                            Icon(Icons.photo_library_outlined, size: 58),
                            SizedBox(height: 12),
                            Text('No photos or videos in Telegram storage', textAlign: TextAlign.center),
                          ])
                        : CustomScrollView(
                            slivers: [
                              for (final group in groups.entries) ...[
                                SliverToBoxAdapter(
                                  child: Padding(
                                    padding: const EdgeInsets.fromLTRB(12, 18, 12, 8),
                                    child: Text(group.key, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                                  ),
                                ),
                                SliverGrid(
                                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                    crossAxisCount: 3,
                                    mainAxisSpacing: 2,
                                    crossAxisSpacing: 2,
                                  ),
                                  delegate: SliverChildBuilderDelegate(
                                    (context, index) {
                                      final file = group.value[index];
                                      final selected = _selected.contains(_key(file));
                                      return _GalleryTile(
                                        file: file,
                                        selected: selected,
                                        selectionMode: selectionMode,
                                        onTap: () {
                                          if (selectionMode) {
                                            _toggle(file);
                                          } else {
                                            final itemIndex = state.media.indexOf(file);
                                            Navigator.of(context).push(MaterialPageRoute(
                                              builder: (_) => GalleryViewerScreen(
                                                media: state.media,
                                                initialIndex: itemIndex,
                                              ),
                                            ));
                                          }
                                        },
                                        onLongPress: () => _toggle(file),
                                      );
                                    },
                                    childCount: group.value.length,
                                  ),
                                ),
                              ],
                              const SliverPadding(padding: EdgeInsets.only(bottom: 100)),
                            ],
                          ),
          ),
          if (_busy) const Positioned.fill(child: ColoredBox(color: Color(0x66000000), child: Center(child: CircularProgressIndicator()))),
        ],
      ),
      bottomNavigationBar: selectionMode
          ? SafeArea(
              child: SizedBox(
                height: 58,
                child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                  IconButton(tooltip: 'Share', onPressed: _busy ? null : () => _share(selectedFiles), icon: const Icon(Icons.ios_share)),
                  IconButton(tooltip: 'Download', onPressed: _busy ? null : () => _download(selectedFiles), icon: const Icon(Icons.download_outlined)),
                  IconButton(tooltip: 'Delete', onPressed: _busy ? null : () => _delete(selectedFiles), icon: const Icon(Icons.delete_outline, color: Colors.red)),
                ]),
              ),
            )
          : null,
    );
  }
}

class _GalleryTile extends ConsumerStatefulWidget {
  const _GalleryTile({
    required this.file,
    required this.selected,
    required this.selectionMode,
    required this.onTap,
    required this.onLongPress,
  });

  final DriveFile file;
  final bool selected;
  final bool selectionMode;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  @override
  ConsumerState<_GalleryTile> createState() => _GalleryTileState();
}

class _GalleryTileState extends ConsumerState<_GalleryTile> {
  Future<String?>? _thumbnail;

  @override
  void initState() {
    super.initState();
    _thumbnail = ref.read(driveRepositoryProvider).downloadThumbnail(widget.file);
  }

  @override
  void didUpdateWidget(covariant _GalleryTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.file.id != widget.file.id || oldWidget.file.folderId != widget.file.folderId) {
      _thumbnail = ref.read(driveRepositoryProvider).downloadThumbnail(widget.file);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      onLongPress: widget.onLongPress,
      child: Stack(fit: StackFit.expand, children: [
        FutureBuilder<String?>(
          future: _thumbnail,
          builder: (context, snapshot) {
            final path = snapshot.data;
            if (path != null && path.isNotEmpty && File(path).existsSync()) {
              return Image.file(File(path), fit: BoxFit.cover, cacheWidth: 420);
            }
            return ColoredBox(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              child: Icon(
                widget.file.type == DriveFileType.video ? Icons.videocam_outlined : Icons.image_outlined,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            );
          },
        ),
        if (widget.file.type == DriveFileType.video)
          const Positioned(left: 7, bottom: 6, child: Icon(Icons.play_circle_fill, color: Colors.white, size: 22, shadows: [Shadow(blurRadius: 4)])),
        if (widget.file.isChunked)
          const Positioned(right: 6, bottom: 6, child: Icon(Icons.layers_rounded, color: Colors.white, size: 18, shadows: [Shadow(blurRadius: 4)])),
        if (widget.selectionMode)
          Positioned(
            top: 6,
            right: 6,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 120),
              width: 25,
              height: 25,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: widget.selected ? Theme.of(context).colorScheme.primary : Colors.black38,
                border: Border.all(color: Colors.white, width: 2),
              ),
              child: widget.selected ? const Icon(Icons.check, color: Colors.white, size: 17) : null,
            ),
          ),
        if (widget.selected) Positioned.fill(child: DecoratedBox(decoration: BoxDecoration(border: Border.all(color: Theme.of(context).colorScheme.primary, width: 3)))),
      ]),
    );
  }
}
