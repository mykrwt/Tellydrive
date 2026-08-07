import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/gallery_grid.dart';
import '../../favorites/presentation/favorites_screen.dart';
import '../../library/domain/entities/media_item.dart';
import '../../library/presentation/library_controller.dart';
import '../../library/presentation/library_selectors.dart';
import '../../search/presentation/search_screen.dart';
import '../../settings/presentation/settings_screen.dart';
import '../../storage/presentation/storage_screen.dart';
import '../../trash/presentation/trash_screen.dart';
import 'item_viewer_screen.dart';

/// Home tab: Google Photos–style, date-grouped gallery with upload, selection,
/// and quick access to Favorites / Storage / Trash / Settings.
class GalleryScreen extends ConsumerStatefulWidget {
  const GalleryScreen({super.key});

  @override
  ConsumerState<GalleryScreen> createState() => _GalleryScreenState();
}

class _GalleryScreenState extends ConsumerState<GalleryScreen> {
  final Set<String> _selected = {};
  bool _selecting = false;

  Future<void> _pickAndUpload(ImageSource source) async {
    final picker = ImagePicker();
    final xfile = await picker.pickImage(source: source);
    if (xfile == null) return;
    await _upload(xfile.path);
  }

  Future<void> _pickVideo(ImageSource source) async {
    final picker = ImagePicker();
    final xfile = await picker.pickVideo(source: source);
    if (xfile == null) return;
    await _upload(xfile.path);
  }

  Future<void> _upload(String path) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final capturedAt = File(path).lastModifiedSync();
      await ref.read(libraryControllerProvider.notifier).addFile(
            path,
            capturedAt: capturedAt,
          );
      messenger.showSnackBar(const SnackBar(content: Text('Upload complete')));
    } on Object catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Upload failed: $e')));
    }
  }

  void _toggleSelect(MediaItem item) {
    setState(() {
      if (_selected.contains(item.id)) {
        _selected.remove(item.id);
        if (_selected.isEmpty) _selecting = false;
      } else {
        _selected.add(item.id);
      }
    });
  }

  Future<void> _deleteSelected() async {
    final items = _selectedItems();
    await ref.read(libraryControllerProvider.notifier).trashMany(items);
    setState(() {
      _selected.clear();
      _selecting = false;
    });
  }

  Future<void> _favoriteSelected() async {
    final controller = ref.read(libraryControllerProvider.notifier);
    for (final item in _selectedItems()) {
      await controller.toggleFavorite(item);
    }
    setState(() {
      _selected.clear();
      _selecting = false;
    });
  }

  Future<void> _downloadSelected() async {
    final controller = ref.read(libraryControllerProvider.notifier);
    for (final item in _selectedItems()) {
      await controller.download(item);
    }
    setState(() {
      _selected.clear();
      _selecting = false;
    });
  }

  List<MediaItem> _selectedItems() {
    final all = ref.read(activeItemsProvider);
    return all.where((e) => _selected.contains(e.id)).toList();
  }

  @override
  Widget build(BuildContext context) {
    final library = ref.watch(libraryControllerProvider);
    final items = ref.watch(activeItemsProvider);
    final loading = library.isLoading && items.isEmpty;

    return Scaffold(
      appBar: _selecting ? _selectionAppBar() : _mainAppBar(items.length),
      body: switch ((loading, items.isEmpty)) {
        (true, _) => const Center(child: CircularProgressIndicator()),
        (false, true) => EmptyState(
            icon: Icons.cloud_upload_outlined,
            title: 'Your library is empty',
            subtitle: 'Back up your photos and videos to your own Telegram '
                'account — original quality, always.',
            actionLabel: 'Back up now',
            onAction: () async {
              await ref.read(libraryControllerProvider.notifier).syncFromTelegram();
            },
          ),
        _ => GalleryGrid(
            items: items,
            selectionMode: _selecting,
            selectedIds: _selected,
            onToggleSelection: _toggleSelect,
            onItemLongPress: (item, index) {
              if (!_selecting) {
                setState(() {
                  _selecting = true;
                  _selected.add(item.id);
                });
              }
            },
            onItemTap: (item, index) {
              if (_selecting) {
                _toggleSelect(item);
              } else {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ItemViewerScreen(items: items, initialIndex: index),
                  ),
                );
              }
            },
          ),
      },
      floatingActionButton: _selecting
          ? null
          : FloatingActionButton(
              onPressed: () => _showUploadSheet(),
              child: const Icon(Icons.add),
            ),
    );
  }

  AppBar _mainAppBar(int count) {
    return AppBar(
      title: Text(
        'TellyBase',
        style: Theme.of(context)
            .textTheme
            .titleLarge
            ?.copyWith(fontWeight: FontWeight.w700),
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.photo_camera_outlined),
          tooltip: 'Take a photo',
          onPressed: () => _pickAndUpload(ImageSource.camera),
        ),
        IconButton(
          icon: const Icon(Icons.search),
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const SearchScreen()),
          ),
        ),
        PopupMenuButton<String>(
          onSelected: (v) => _openSection(v),
          itemBuilder: (context) => const [
            PopupMenuItem(value: 'favorites', child: Text('Favorites')),
            PopupMenuItem(value: 'storage', child: Text('Storage')),
            PopupMenuItem(value: 'trash', child: Text('Trash')),
            PopupMenuItem(value: 'settings', child: Text('Settings')),
          ],
        ),
      ],
    );
  }

  AppBar _selectionAppBar() {
    final n = _selected.length;
    return AppBar(
      leading: IconButton(
        icon: const Icon(Icons.close),
        onPressed: () => setState(() {
          _selected.clear();
          _selecting = false;
        }),
      ),
      title: Text('$n selected'),
      actions: [
        IconButton(
          icon: const Icon(Icons.favorite_outline),
          onPressed: _favoriteSelected,
        ),
        IconButton(
          icon: const Icon(Icons.download),
          onPressed: _downloadSelected,
        ),
        IconButton(
          icon: const Icon(Icons.delete_outline),
          onPressed: _deleteSelected,
        ),
      ],
    );
  }

  void _openSection(String value) {
    final route = switch (value) {
      'favorites' => const FavoritesScreen(),
      'storage' => const StorageScreen(),
      'trash' => const TrashScreen(),
      'settings' => const SettingsScreen(),
      _ => null,
    };
    if (route != null) {
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => route));
    }
  }

  void _showUploadSheet() {
    showModalBottomSheet<void>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Upload photo'),
              onTap: () {
                Navigator.pop(context);
                _pickAndUpload(ImageSource.gallery);
              },
            ),
            ListTile(
              leading: const Icon(Icons.video_library_outlined),
              title: const Text('Upload video'),
              onTap: () {
                Navigator.pop(context);
                _pickVideo(ImageSource.gallery);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () {
                Navigator.pop(context);
                _pickAndUpload(ImageSource.camera);
              },
            ),
          ],
        ),
      ),
    );
  }
}
