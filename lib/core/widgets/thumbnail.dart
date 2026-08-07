import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/di/providers.dart';
import '../../features/library/domain/entities/media_item.dart';
import '../storage/media_cache.dart';
import '../utils/media_type.dart';

/// A lightweight LRU of in-flight thumbnail loads so scrolling a grid does not
/// spawn a download per tile.
final Map<int, Future<String?>> _thumbnailFutures = {};
final Map<int, String> _thumbnailMemory = {};

/// Renders a tile preview for a [MediaItem]. The full original bytes are only
/// fetched once per item and cached to [MediaCache]; subsequent renders are
/// served from disk instantly.
class Thumbnail extends ConsumerWidget {
  const Thumbnail({super.key, required this.item, this.fit = BoxFit.cover});

  final MediaItem item;
  final BoxFit fit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final path = _thumbnailMemory[item.firstMessageId];
    if (path != null) {
      return _image(path, item);
    }
    final future = _thumbnailFutures[item.firstMessageId] ??
        (_thumbnailFutures[item.firstMessageId] = _load(ref, item));
    return FutureBuilder<String?>(
      future: future,
      builder: (context, snapshot) {
        final p = snapshot.data;
        if (p != null) return _image(p, item);
        return _placeholder(item);
      },
    );
  }

  Widget _image(String path, MediaItem item) {
    return item.mediaType == MediaType.video
        ? Stack(
            fit: StackFit.expand,
            children: [
              Image.file(
                File(path),
                fit: fit,
                errorBuilder: (_, __, ___) => _placeholder(item),
              ),
              const Center(
                child: Icon(Icons.play_circle_outline,
                    size: 36, color: Colors.white70),
              ),
            ],
          )
        : Image.file(
            File(path),
            fit: fit,
            errorBuilder: (_, __, ___) => _placeholder(item),
          );
  }

  Widget _placeholder(MediaItem item) {
    return Container(
      color: Colors.white10,
      alignment: Alignment.center,
      child: Icon(
        item.mediaType == MediaType.video ? Icons.movie : Icons.image,
        color: Colors.white24,
        size: 32,
      ),
    );
  }

  Future<String?> _load(WidgetRef ref, MediaItem item) async {
    try {
      // Serve from disk cache if present.
      if (await MediaCache.instance.exists(item.firstMessageId, item.fileName)) {
        final path = await MediaCache.instance.pathFor(item.firstMessageId, item.fileName);
        _thumbnailMemory[item.firstMessageId] = path;
        return path;
      }
      // Otherwise download once (via the library controller, which caches).
      final file = await ref
          .read(libraryControllerProvider.notifier)
          .download(item, destinationDir: null);
      if (file.existsSync()) {
        await MediaCache.instance.put(item.firstMessageId, item.fileName, file);
        final path = file.path;
        _thumbnailMemory[item.firstMessageId] = path;
        return path;
      }
    } on Object {
      // fall through to placeholder
    } finally {
      _thumbnailFutures.remove(item.firstMessageId);
    }
    return null;
  }
}
