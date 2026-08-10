import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:photo_view/photo_view.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player/video_player.dart';

import '../../../../services/files/file_action_service.dart';
import '../../../drive/domain/entities/drive_file.dart';
import '../../../drive/presentation/providers/drive_provider.dart';
import '../providers/vault_provider.dart';

class VaultViewerScreen extends ConsumerStatefulWidget {
  const VaultViewerScreen({
    super.key,
    required this.media,
    required this.initialIndex,
  });

  final List<DriveFile> media;
  final int initialIndex;

  @override
  ConsumerState<VaultViewerScreen> createState() => _VaultViewerScreenState();
}

class _VaultViewerScreenState extends ConsumerState<VaultViewerScreen> {
  late final PageController _controller;
  late List<DriveFile> _media;
  late int _index;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _media = List.of(widget.media);
    _index = widget.initialIndex.clamp(0, _media.length - 1) as int;
    _controller = PageController(initialPage: _index);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  DriveFile get _current => _media[_index];

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.toString()), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final file = _current;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete from Vault?'),
        content: const Text('This permanently deletes the encrypted Telegram files.'),
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
    await _run(() async {
      await ref.read(vaultProvider.notifier).deleteMedia([file]);
      if (!mounted) return;
      setState(() {
        _media.removeAt(_index);
        if (_index >= _media.length) _index = _media.length - 1;
      });
      if (_media.isEmpty && mounted) Navigator.pop(context);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_media.isEmpty) return const SizedBox.shrink();
    final file = _current;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Column(children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.shield, color: Colors.white70, size: 16),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  file.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 15),
                ),
              ),
            ],
          ),
          Text('${_index + 1} of ${_media.length}',
              style: const TextStyle(fontSize: 11, color: Colors.white70)),
        ]),
      ),
      body: Stack(children: [
        PageView.builder(
          controller: _controller,
          itemCount: _media.length,
          onPageChanged: (value) => setState(() => _index = value),
          itemBuilder: (context, index) => _VaultMediaPage(file: _media[index]),
        ),
        if (_busy)
          const Positioned.fill(
              child: ColoredBox(
                  color: Color(0x66000000),
                  child: Center(child: CircularProgressIndicator()))),
      ]),
      bottomNavigationBar: SafeArea(
        child: ColoredBox(
          color: Colors.black,
          child: SizedBox(
            height: 58,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                IconButton(
                  tooltip: 'Share',
                  color: Colors.white,
                  onPressed: _busy
                      ? null
                      : () => _run(() async {
                            final notifier = ref.read(vaultProvider.notifier);
                            final path = await notifier.getDecryptedFile(file);
                            await SharePlus.instance.share(ShareParams(files: [XFile(path)]));
                          }),
                  icon: const Icon(Icons.ios_share),
                ),
                IconButton(
                  tooltip: 'Download',
                  color: Colors.white,
                  onPressed: _busy
                      ? null
                      : () => _run(() async {
                            final notifier = ref.read(vaultProvider.notifier);
                            final repository = ref.read(driveRepositoryProvider);
                            final path = await notifier.getDecryptedFile(file);
                            final fakeFile = file.copyWith(localPath: path);
                            await FileActionService.downloadToDevice(repository, fakeFile);
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text('Saved to Downloads/TeleDrive')),
                              );
                            }
                          }),
                  icon: const Icon(Icons.download_outlined),
                ),
                IconButton(
                  tooltip: 'Move to normal Gallery',
                  color: Colors.white,
                  onPressed: _busy
                      ? null
                      : () => _run(() async {
                            await ref.read(vaultProvider.notifier).unvaultToGallery([file]);
                            if (!mounted) return;
                            setState(() {
                              _media.removeAt(_index);
                              if (_index >= _media.length) _index = _media.length - 1;
                            });
                            if (_media.isEmpty && mounted) {
                              Navigator.pop(context);
                            } else {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Moved to normal Gallery')),
                              );
                            }
                          }),
                  icon: const Icon(Icons.unarchive_outlined),
                ),
                IconButton(
                  tooltip: 'Delete',
                  color: Colors.redAccent,
                  onPressed: _busy ? null : _delete,
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _VaultMediaPage extends ConsumerStatefulWidget {
  const _VaultMediaPage({required this.file});
  final DriveFile file;

  @override
  ConsumerState<_VaultMediaPage> createState() => _VaultMediaPageState();
}

class _VaultMediaPageState extends ConsumerState<_VaultMediaPage> {
  Future<String>? _decrypted;

  @override
  void initState() {
    super.initState();
    _decrypted = ref.read(vaultProvider.notifier).getDecryptedFile(widget.file);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String>(
      future: _decrypted,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(snapshot.error.toString(),
                  style: const TextStyle(color: Colors.white),
                  textAlign: TextAlign.center),
            ),
          );
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        if (widget.file.type == DriveFileType.video) {
          return _VaultVideoPage(path: snapshot.data!);
        }
        return PhotoView(
          imageProvider: FileImage(File(snapshot.data!)),
          backgroundDecoration: const BoxDecoration(color: Colors.black),
          minScale: PhotoViewComputedScale.contained,
          maxScale: PhotoViewComputedScale.covered * 4,
          errorBuilder: (_, error, __) => Center(
              child: Text(error.toString(),
                  style: const TextStyle(color: Colors.white))),
        );
      },
    );
  }
}

class _VaultVideoPage extends StatefulWidget {
  const _VaultVideoPage({required this.path});
  final String path;

  @override
  State<_VaultVideoPage> createState() => _VaultVideoPageState();
}

class _VaultVideoPageState extends State<_VaultVideoPage> {
  late final VideoPlayerController _controller;
  late final Future<void> _initialize;

  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.file(File(widget.path));
    _initialize = _controller.initialize().then((_) async {
      if (!mounted) return;
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool('gallery_autoplay') ?? true) {
        await _controller.play();
      }
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _initialize,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(
              child: Text(snapshot.error.toString(),
                  style: const TextStyle(color: Colors.white)));
        }
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        return GestureDetector(
          onTap: () => setState(() =>
              _controller.value.isPlaying
                  ? _controller.pause()
                  : _controller.play()),
          child: Stack(alignment: Alignment.center, children: [
            Center(
              child: AspectRatio(
                aspectRatio: _controller.value.aspectRatio,
                child: VideoPlayer(_controller),
              ),
            ),
            if (!_controller.value.isPlaying)
              const DecoratedBox(
                decoration:
                    BoxDecoration(color: Colors.black45, shape: BoxShape.circle),
                child: Padding(
                    padding: EdgeInsets.all(12),
                    child: Icon(Icons.play_arrow,
                        size: 54, color: Colors.white)),
              ),
            Positioned(
              left: 16,
              right: 16,
              bottom: 20,
              child: VideoProgressIndicator(
                _controller,
                allowScrubbing: true,
                colors: const VideoProgressColors(playedColor: Colors.white),
              ),
            ),
          ]),
        );
      },
    );
  }
}
