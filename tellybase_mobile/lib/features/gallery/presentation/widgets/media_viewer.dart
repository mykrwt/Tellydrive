import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tellybase_mobile/core/config/app_config.dart';
import 'package:tellybase_mobile/core/di/providers.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_file.dart';
import 'package:tellybase_mobile/features/storage/presentation/widgets/authenticated_image.dart';
import 'package:video_player/video_player.dart';

class MediaViewer extends ConsumerStatefulWidget {
  const MediaViewer({
    required this.files,
    required this.initialIndex,
    required this.onDownload,
    required this.onFavorite,
    super.key,
  });

  final List<CloudFile> files;
  final int initialIndex;
  final ValueChanged<CloudFile> onDownload;
  final ValueChanged<CloudFile> onFavorite;

  @override
  ConsumerState<MediaViewer> createState() => _MediaViewerState();
}

class _MediaViewerState extends ConsumerState<MediaViewer> {
  late var _index = widget.initialIndex;
  final _favoriteOverrides = <String, bool>{};

  CloudFile _fileAt(int index) {
    final file = widget.files[index];
    final favorite = _favoriteOverrides[file.id];
    return favorite == null ? file : file.copyWith(favorite: favorite);
  }

  @override
  Widget build(BuildContext context) {
    final file = _fileAt(_index);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: Text(file.name, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            tooltip: 'Download',
            onPressed: () => widget.onDownload(file),
            icon: const Icon(Icons.download_outlined),
          ),
          IconButton(
            tooltip: file.favorite ? 'Remove favorite' : 'Add favorite',
            onPressed: () {
              widget.onFavorite(file);
              setState(() => _favoriteOverrides[file.id] = !file.favorite);
            },
            icon: Icon(
              file.favorite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
              color: file.favorite ? const Color(0xFFFF7D9B) : Colors.white,
            ),
          ),
        ],
      ),
      body: PageView.builder(
        controller: PageController(initialPage: widget.initialIndex),
        itemCount: widget.files.length,
        onPageChanged: (value) => setState(() => _index = value),
        itemBuilder: (context, index) {
          final item = _fileAt(index);
          if (item.kind == CloudFileKind.video) {
            return _VideoPage(file: item);
          }
          return InteractiveViewer(
            maxScale: 5,
            child: Center(
              child: AuthenticatedImage(
                path: '/api/files/${Uri.encodeComponent(item.id)}?download=1&proxy=1&inline=1',
                fit: BoxFit.contain,
              ),
            ),
          );
        },
      ),
    );
  }
}

class _VideoPage extends ConsumerStatefulWidget {
  const _VideoPage({required this.file});
  final CloudFile file;

  @override
  ConsumerState<_VideoPage> createState() => _VideoPageState();
}

class _VideoPageState extends ConsumerState<_VideoPage> {
  VideoPlayerController? _controller;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text('Video preview failed.\n$_error', textAlign: TextAlign.center),
        ),
      );
    }
    if (controller == null || !controller.value.isInitialized) {
      return const Center(child: CircularProgressIndicator());
    }
    return Center(
      child: GestureDetector(
        onTap: () {
          controller.value.isPlaying ? controller.pause() : controller.play();
          setState(() {});
        },
        child: Stack(
          alignment: Alignment.center,
          children: [
            AspectRatio(
              aspectRatio: controller.value.aspectRatio,
              child: VideoPlayer(controller),
            ),
            if (!controller.value.isPlaying)
              Container(
                width: 68,
                height: 68,
                decoration: const BoxDecoration(
                  color: Color(0xAA000000),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.play_arrow_rounded, size: 42),
              ),
            Positioned(
              left: 20,
              right: 20,
              bottom: 24,
              child: VideoProgressIndicator(
                controller,
                allowScrubbing: true,
                colors: VideoProgressColors(
                  playedColor: Theme.of(context).colorScheme.primary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _initialize() async {
    try {
      final cookie = await ref.read(sessionStorageProvider).readCookie();
      final controller = VideoPlayerController.networkUrl(
        AppConfig.resolveUri(
          '/api/files/${Uri.encodeComponent(widget.file.id)}?download=1&proxy=1&inline=1',
        ),
        httpHeaders: cookie == null ? const {} : <String, String>{'Cookie': cookie},
      );
      await controller.initialize();
      await controller.setLooping(true);
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _controller = controller);
    } catch (error) {
      if (mounted) setState(() => _error = error);
    }
  }
}
