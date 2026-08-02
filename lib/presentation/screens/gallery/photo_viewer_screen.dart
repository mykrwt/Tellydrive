import 'dart:io';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/theme/app_theme.dart';
import '../../../domain/models/file_entry.dart';
import '../../../state/app_providers.dart';

/// Full-screen photo/video viewer with swipe-between-items paging, a
/// translucent floating toolbar (share / favorite / download), and a
/// download-progress overlay for cloud-only items — modeled on the Apple
/// Photos detail viewer.
class PhotoViewerScreen extends ConsumerStatefulWidget {
  const PhotoViewerScreen({super.key, required this.entries, required this.initialIndex});
  final List<FileEntry> entries;
  final int initialIndex;

  @override
  ConsumerState<PhotoViewerScreen> createState() => _PhotoViewerScreenState();
}

class _PhotoViewerScreenState extends ConsumerState<PhotoViewerScreen> {
  late final PageController _controller = PageController(initialPage: widget.initialIndex);
  late int _index = widget.initialIndex;
  double? _downloadProgress;

  FileEntry get _current => widget.entries[_index];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          PageView.builder(
            controller: _controller,
            itemCount: widget.entries.length,
            onPageChanged: (i) => setState(() => _index = i),
            itemBuilder: (context, i) {
              final entry = widget.entries[i];
              final hasLocal = entry.localPath != null && File(entry.localPath!).existsSync();
              return Hero(
                tag: 'media-${entry.id}',
                child: hasLocal
                    ? InteractiveViewer(child: Image.file(File(entry.localPath!), fit: BoxFit.contain))
                    : Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(CupertinoIcons.cloud_download, color: Colors.white70, size: 48),
                            const SizedBox(height: 12),
                            Text(
                              'Stored in your Telegram vault',
                              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.white70),
                            ),
                          ],
                        ),
                      ),
              );
            },
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(CupertinoIcons.xmark_circle_fill, color: Colors.white70),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  const Spacer(),
                  Text(
                    _current.originalName,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                  ),
                  const Spacer(),
                ],
              ),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 24,
            child: _BottomToolbar(
              entry: _current,
              downloadProgress: _downloadProgress,
              onDownload: _handleDownload,
              onShare: _handleShare,
              onFavorite: () {},
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _handleDownload() async {
    final repo = await ref.read(fileRepositoryProvider.future);
    setState(() => _downloadProgress = 0);
    await for (final p in repo.downloadFile(
      entry: _current,
      destinationDir: Directory.systemTemp,
    )) {
      setState(() => _downloadProgress = p.fraction);
    }
    setState(() => _downloadProgress = null);
  }

  Future<void> _handleShare() async {
    final path = _current.localPath;
    if (path != null) {
      await Share.shareXFiles([XFile(path)]);
    }
  }
}

class _BottomToolbar extends StatelessWidget {
  const _BottomToolbar({
    required this.entry,
    required this.downloadProgress,
    required this.onDownload,
    required this.onShare,
    required this.onFavorite,
  });

  final FileEntry entry;
  final double? downloadProgress;
  final VoidCallback onDownload;
  final VoidCallback onShare;
  final VoidCallback onFavorite;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.12),
          borderRadius: BorderRadius.circular(30),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _ToolbarIcon(icon: CupertinoIcons.share, onTap: onShare),
            const SizedBox(width: 20),
            _ToolbarIcon(
              icon: entry.isFavorite ? CupertinoIcons.star_fill : CupertinoIcons.star,
              onTap: onFavorite,
            ),
            const SizedBox(width: 20),
            if (downloadProgress != null)
              SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(value: downloadProgress, color: Colors.white, strokeWidth: 2.5),
              )
            else
              _ToolbarIcon(icon: CupertinoIcons.cloud_download, onTap: onDownload),
          ],
        ),
      ),
    );
  }
}

class _ToolbarIcon extends StatelessWidget {
  const _ToolbarIcon({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return IconButton(icon: Icon(icon, color: Colors.white), onPressed: onTap);
  }
}
