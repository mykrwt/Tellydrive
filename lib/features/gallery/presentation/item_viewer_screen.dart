import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:video_player/video_player.dart';

import '../../../core/di/providers.dart';
import '../../../core/storage/media_cache.dart';
import '../../../core/utils/date_formatters.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/media_type.dart';
import '../../library/domain/entities/media_item.dart';
import '../../library/presentation/library_controller.dart';

/// Full-screen viewer with pinch-to-zoom, swipe between items, and quick
/// actions (favorite / download / trash). Media is loaded at original quality.
class ItemViewerScreen extends ConsumerStatefulWidget {
  const ItemViewerScreen({
    super.key,
    required this.items,
    this.initialIndex = 0,
  });

  final List<MediaItem> items;
  final int initialIndex;

  @override
  ConsumerState<ItemViewerScreen> createState() => _ItemViewerScreenState();
}

class _ItemViewerScreenState extends ConsumerState<ItemViewerScreen> {
  late final PageController _controller;
  late int _index;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
    _controller = PageController(initialPage: _index);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            PageView.builder(
              controller: _controller,
              itemCount: widget.items.length,
              onPageChanged: (i) => setState(() => _index = i),
              itemBuilder: (context, i) {
                final item = widget.items[i];
                return _ViewerPage(item: item);
              },
            ),
            // Top bar
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: _TopBar(
                item: widget.items[_index],
                onClose: () => Navigator.of(context).pop(),
              ),
            ),
            // Bottom info bar
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: _InfoBar(item: widget.items[_index]),
            ),
          ],
        ),
      ),
    );
  }
}

class _ViewerPage extends ConsumerStatefulWidget {
  const _ViewerPage({required this.item});

  final MediaItem item;

  @override
  ConsumerState<_ViewerPage> createState() => _ViewerPageState();
}

class _ViewerPageState extends ConsumerState<_ViewerPage> {
  Future<String?>? _future;

  Future<String?> _load() async {
    if (await MediaCache.instance.exists(widget.item.firstMessageId, widget.item.fileName)) {
      return MediaCache.instance.pathFor(widget.item.firstMessageId, widget.item.fileName);
    }
    final file = await ref
        .read(libraryControllerProvider.notifier)
        .download(widget.item);
    if (file.existsSync()) {
      await MediaCache.instance.put(widget.item.firstMessageId, widget.item.fileName, file);
      return file.path;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    _future ??= _load();
    return FutureBuilder<String?>(
      future: _future,
      builder: (context, snapshot) {
        final path = snapshot.data;
        if (path == null) {
          return const Center(
            child: CircularProgressIndicator(color: Colors.white),
          );
        }
        if (widget.item.mediaType == MediaType.video) {
          return _VideoView(path: path);
        }
        return InteractiveViewer(
          minScale: 1,
          maxScale: 6,
          child: Center(
            child: Image.file(
              File(path),
              fit: BoxFit.contain,
            ),
          ),
        );
      },
    );
  }
}

class _VideoView extends StatefulWidget {
  const _VideoView({required this.path});
  final String path;

  @override
  State<_VideoView> createState() => _VideoViewState();
}

class _VideoViewState extends State<_VideoView> {
  late VideoPlayerController _controller;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.file(File(widget.path))
      ..initialize().then((_) {
        if (mounted) setState(() => _ready = true);
      });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const Center(child: CircularProgressIndicator(color: Colors.white));
    }
    return GestureDetector(
      onTap: () => _controller.value.isPlaying
          ? _controller.pause()
          : _controller.play(),
      child: Center(
        child: AspectRatio(
          aspectRatio: _controller.value.aspectRatio,
          child: VideoPlayer(_controller),
        ),
      ),
    );
  }
}

class _TopBar extends ConsumerWidget {
  const _TopBar({required this.item, required this.onClose});

  final MediaItem item;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.black.withValues(alpha: 0.7), Colors.transparent],
        ),
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: onClose,
          ),
          Expanded(
            child: Text(
              item.fileName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white, fontSize: 16),
            ),
          ),
          IconButton(
            icon: Icon(
              item.favorite ? Icons.favorite : Icons.favorite_border,
              color: item.favorite ? Colors.redAccent : Colors.white,
            ),
            onPressed: () =>
                ref.read(libraryControllerProvider.notifier).toggleFavorite(item),
          ),
          IconButton(
            icon: const Icon(Icons.download, color: Colors.white),
            onPressed: () async {
              final messenger = ScaffoldMessenger.of(context);
              await ref.read(libraryControllerProvider.notifier).download(item);
              messenger.showSnackBar(
                const SnackBar(content: Text('Saved to Downloads')),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline, color: Colors.white),
            onPressed: () {
              ref.read(libraryControllerProvider.notifier).trash(item);
              Navigator.of(context).pop();
            },
          ),
        ],
      ),
    );
  }
}

class _InfoBar extends StatelessWidget {
  const _InfoBar({required this.item});

  final MediaItem item;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.transparent, Colors.black.withValues(alpha: 0.7)],
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            item.fileName,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(
            '${DateFormatters.detailTimestamp(item.displayDate)} · '
            '${Formatters.bytes(item.size)}',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.8),
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}
