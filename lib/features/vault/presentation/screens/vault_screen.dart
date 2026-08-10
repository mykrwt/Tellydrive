import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../services/files/file_action_service.dart';
import '../../../drive/domain/entities/drive_file.dart';
import '../../../drive/presentation/providers/drive_provider.dart';
import '../providers/vault_provider.dart';
import 'vault_viewer_screen.dart';

class VaultScreen extends ConsumerStatefulWidget {
  const VaultScreen({super.key});

  @override
  ConsumerState<VaultScreen> createState() => _VaultScreenState();
}

class _VaultScreenState extends ConsumerState<VaultScreen> {
  final Set<String> _selected = {};
  bool _busy = false;
  String? _statusMessage;

  static const _minColumns = 2.0;
  static const _maxColumns = 8.0;
  double _targetColumns = 3.0;
  double _pinchBase = 3.0;
  int _lastColumnHint = 3;
  bool _showZoomHint = false;
  bool _pinchEnabled = true;
  Timer? _hintTimer;

  @override
  void initState() {
    super.initState();
    _loadPrefs();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(vaultProvider.notifier).refresh();
    });
  }

  @override
  void dispose() {
    _hintTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadPrefs() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final saved = sp.getInt(PrefKeys.galleryColumns) ?? 3;
      final pinch = sp.getBool(PrefKeys.galleryPinchZoom) ?? true;
      if (mounted) {
        setState(() {
          _targetColumns = saved.toDouble().clamp(_minColumns, _maxColumns);
          _lastColumnHint = saved;
          _pinchEnabled = pinch;
        });
      }
    } catch (_) {}
  }

  Future<void> _persistColumns() async {
    try {
      final sp = await SharedPreferences.getInstance();
      await sp.setInt(PrefKeys.galleryColumns, _targetColumns.round());
    } catch (_) {}
  }

  void _handleScaleStart(ScaleStartDetails _) {
    _pinchBase = _targetColumns;
  }

  void _handleScaleUpdate(ScaleUpdateDetails details) {
    if (!_pinchEnabled) return;
    if ((details.scale - 1).abs() < 0.02) return;
    final desired =
        (_pinchBase / details.scale).clamp(_minColumns, _maxColumns);
    final newInt = desired.round();
    if (newInt != _lastColumnHint) {
      _lastColumnHint = newInt;
      HapticFeedback.selectionClick();
      _flashHint();
    }
    setState(() => _targetColumns = desired);
  }

  void _handleScaleEnd(ScaleEndDetails _) {
    _persistColumns();
  }

  void _flashHint() {
    _hintTimer?.cancel();
    setState(() => _showZoomHint = true);
    _hintTimer = Timer(const Duration(milliseconds: 900), () {
      if (mounted) setState(() => _showZoomHint = false);
    });
  }

  String _key(DriveFile file) => file.id;

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

  Future<void> _pickAndUpload() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.media,
    );
    if (result == null || result.paths.isEmpty) return;
    final paths = result.paths.whereType<String>().toList();
    if (paths.isEmpty) return;

    setState(() {
      _busy = true;
      _statusMessage = 'Encrypting & uploading ${paths.length} file(s)...';
    });
    try {
      await ref.read(vaultProvider.notifier).uploadMediaToVault(paths);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${paths.length} file(s) encrypted and added to Vault.'),
          ),
        );
      }
    } catch (e) {
      if (mounted) _showError(e);
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _statusMessage = null;
        });
      }
    }
  }

  Future<void> _lockAndExit() async {
    await ref.read(vaultProvider.notifier).lock();
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _delete(List<DriveFile> files) async {
    if (files.isEmpty) return;
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: Text(
                files.length == 1 ? 'Delete this item?' : 'Delete ${files.length} items?'),
            content: const Text(
                'This permanently deletes the encrypted Telegram files and cannot be undone.'),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('Cancel')),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: Colors.red),
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Delete'),
              ),
            ],
          ),
        ) ??
        false;
    if (!confirmed) return;

    setState(() => _busy = true);
    try {
      await ref.read(vaultProvider.notifier).deleteMedia(files);
      if (mounted) setState(_selected.clear);
    } catch (error) {
      if (mounted) _showError(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _download(List<DriveFile> files) async {
    if (files.isEmpty) return;
    setState(() {
      _busy = true;
      _statusMessage = 'Decrypting & saving to device...';
    });
    try {
      final notifier = ref.read(vaultProvider.notifier);
      final repository = ref.read(driveRepositoryProvider);
      for (final file in files) {
        final decryptedPath = await notifier.getDecryptedFile(file);
        final tempFile = File(decryptedPath);
        final fakeFile = file.copyWith(localPath: tempFile.path);
        await FileActionService.downloadToDevice(repository, fakeFile);
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              files.length == 1
                  ? 'Saved decrypted media to Downloads/TeleDrive'
                  : '${files.length} items saved to Downloads/TeleDrive',
            ),
          ),
        );
      }
    } catch (error) {
      if (mounted) _showError(error);
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _statusMessage = null;
        });
      }
    }
  }

  Future<void> _share(List<DriveFile> files) async {
    if (files.isEmpty) return;
    setState(() {
      _busy = true;
      _statusMessage = 'Decrypting for share...';
    });
    try {
      final notifier = ref.read(vaultProvider.notifier);
      final paths = <XFile>[];
      for (final file in files) {
        final decryptedPath = await notifier.getDecryptedFile(file);
        paths.add(XFile(decryptedPath));
      }
      await SharePlus.instance.share(ShareParams(files: paths));
    } catch (error) {
      if (mounted) _showError(error);
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _statusMessage = null;
        });
      }
    }
  }

  Future<void> _unvault(List<DriveFile> files) async {
    if (files.isEmpty) return;
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: Text(
                files.length == 1 ? 'Move to normal Gallery?' : 'Move ${files.length} items to Gallery?'),
            content: const Text(
                'This will decrypt the item(s) and move them to your normal TeleDrive Gallery.'),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('Cancel')),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Move'),
              ),
            ],
          ),
        ) ??
        false;
    if (!confirmed) return;

    setState(() {
      _busy = true;
      _statusMessage = 'Moving to normal Gallery...';
    });
    try {
      await ref.read(vaultProvider.notifier).unvaultToGallery(files);
      if (mounted) {
        setState(_selected.clear);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${files.length} item(s) moved to normal Gallery.'),
          ),
        );
      }
    } catch (error) {
      if (mounted) _showError(error);
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _statusMessage = null;
        });
      }
    }
  }

  void _showError(Object error) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error.toString()), backgroundColor: Colors.red),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(vaultProvider);
    final groups = _groups(state.media);
    final selectedFiles = _selectedFiles(state.media);
    final selectionMode = _selected.isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        title: selectionMode
            ? Text('${_selected.length} Selected')
            : const Text('Hidden Vault',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
        leading: selectionMode
            ? IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => setState(_selected.clear))
            : IconButton(
                icon: const Icon(Icons.arrow_back_rounded),
                onPressed: _lockAndExit,
              ),
        actions: [
          if (!selectionMode) ...[
            IconButton(
              tooltip: 'Add Media to Vault',
              icon: const Icon(Icons.add_photo_alternate_outlined),
              onPressed: _busy ? null : _pickAndUpload,
            ),
            IconButton(
              tooltip: 'Lock Vault',
              icon: const Icon(Icons.lock_rounded),
              onPressed: _lockAndExit,
            ),
          ] else
            TextButton(
              onPressed: () => setState(() {
                if (_selected.length == state.media.length) {
                  _selected.clear();
                } else {
                  _selected.addAll(state.media.map(_key));
                }
              }),
              child: Text(_selected.length == state.media.length
                  ? 'Deselect All'
                  : 'Select All'),
            ),
        ],
      ),
      body: Stack(
        children: [
          RefreshIndicator(
            onRefresh: ref.read(vaultProvider.notifier).refresh,
            child: state.isLoading && state.media.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : state.error != null && state.media.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(32),
                          child: Text(state.error!,
                              style: const TextStyle(color: Colors.redAccent),
                              textAlign: TextAlign.center),
                        ),
                      )
                    : state.media.isEmpty
                        ? Center(
                            child: Padding(
                              padding: const EdgeInsets.all(32),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.shield_outlined,
                                      size: 64,
                                      color: Theme.of(context)
                                          .colorScheme
                                          .onSurfaceVariant),
                                  const SizedBox(height: 16),
                                  Text(
                                    'Your Hidden Vault is Empty',
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium
                                        ?.copyWith(fontWeight: FontWeight.w600),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    'Add photos or videos directly, or move them from your normal Gallery.',
                                    textAlign: TextAlign.center,
                                    style:
                                        Theme.of(context).textTheme.bodySmall,
                                  ),
                                  const SizedBox(height: 24),
                                  FilledButton.icon(
                                    onPressed: _pickAndUpload,
                                    icon: const Icon(Icons.add_a_photo_outlined),
                                    label: const Text('Add to Vault'),
                                  ),
                                ],
                              ),
                            ),
                          )
                        : GestureDetector(
                            onScaleStart: _handleScaleStart,
                            onScaleUpdate: _handleScaleUpdate,
                            onScaleEnd: _handleScaleEnd,
                            child: _VaultAnimatedGrid(
                              targetColumns: _targetColumns,
                              groups: groups,
                              selected: _selected,
                              selectionMode: selectionMode,
                              onToggle: _toggle,
                              onOpen: (file) {
                                final itemIndex = state.media.indexOf(file);
                                Navigator.of(context).push(MaterialPageRoute(
                                  builder: (_) => VaultViewerScreen(
                                    media: state.media,
                                    initialIndex: itemIndex,
                                  ),
                                ));
                              },
                            ),
                          ),
          ),
          if (_showZoomHint && _pinchEnabled)
            Positioned(
              bottom: 24,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.78),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.grid_view_rounded,
                        color: Colors.white, size: 16),
                    const SizedBox(width: 6),
                    Text('${_targetColumns.round()} columns',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.w600)),
                  ]),
                ),
              ),
            ),
          if (_busy)
            Positioned.fill(
              child: ColoredBox(
                color: const Color(0x7F000000),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const CircularProgressIndicator(),
                      if (_statusMessage != null) ...[
                        const SizedBox(height: 16),
                        Text(
                          _statusMessage!,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
      bottomNavigationBar: selectionMode
          ? SafeArea(
              child: SizedBox(
                height: 58,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    IconButton(
                      tooltip: 'Share',
                      onPressed: _busy ? null : () => _share(selectedFiles),
                      icon: const Icon(Icons.ios_share),
                    ),
                    IconButton(
                      tooltip: 'Download',
                      onPressed: _busy ? null : () => _download(selectedFiles),
                      icon: const Icon(Icons.download_outlined),
                    ),
                    IconButton(
                      tooltip: 'Move to Gallery',
                      onPressed: _busy ? null : () => _unvault(selectedFiles),
                      icon: const Icon(Icons.unarchive_outlined),
                    ),
                    IconButton(
                      tooltip: 'Delete',
                      onPressed: _busy ? null : () => _delete(selectedFiles),
                      icon: const Icon(Icons.delete_outline,
                          color: Colors.red),
                    ),
                  ],
                ),
              ),
            )
          : null,
    );
  }
}

class _VaultAnimatedGrid extends StatelessWidget {
  const _VaultAnimatedGrid({
    required this.targetColumns,
    required this.groups,
    required this.selected,
    required this.selectionMode,
    required this.onToggle,
    required this.onOpen,
  });

  final double targetColumns;
  final Map<String, List<DriveFile>> groups;
  final Set<String> selected;
  final bool selectionMode;
  final void Function(DriveFile) onToggle;
  final void Function(DriveFile) onOpen;

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 3, end: targetColumns),
      duration: const Duration(milliseconds: 160),
      curve: Curves.easeOutCubic,
      builder: (context, columns, _) {
        final extent = (screenWidth / columns).clamp(48.0, screenWidth / 1.5);
        return CustomScrollView(
          slivers: [
            for (final group in groups.entries) ...[
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 18, 12, 8),
                  child: Text(group.key,
                      style: const TextStyle(
                          fontSize: 20, fontWeight: FontWeight.w700)),
                ),
              ),
              SliverGrid(
                gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: extent,
                  mainAxisSpacing: 2,
                  crossAxisSpacing: 2,
                  childAspectRatio: 1,
                ),
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final file = group.value[index];
                    return _VaultTile(
                      file: file,
                      selected: selected.contains(file.id),
                      selectionMode: selectionMode,
                      onTap: () {
                        if (selectionMode) {
                          onToggle(file);
                        } else {
                          onOpen(file);
                        }
                      },
                      onLongPress: () => onToggle(file),
                    );
                  },
                  childCount: group.value.length,
                ),
              ),
            ],
            const SliverPadding(padding: EdgeInsets.only(bottom: 40)),
          ],
        );
      },
    );
  }
}

class _VaultTile extends ConsumerStatefulWidget {
  const _VaultTile({
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
  ConsumerState<_VaultTile> createState() => _VaultTileState();
}

class _VaultTileState extends ConsumerState<_VaultTile> {
  Future<String>? _decryptedFuture;

  @override
  void initState() {
    super.initState();
    _loadThumbnail();
  }

  void _loadThumbnail() {
    _decryptedFuture =
        ref.read(vaultProvider.notifier).getDecryptedFile(widget.file);
  }

  @override
  void didUpdateWidget(covariant _VaultTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.file.id != widget.file.id) {
      _loadThumbnail();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isVideo = widget.file.type == DriveFileType.video;

    return GestureDetector(
      onTap: widget.onTap,
      onLongPress: widget.onLongPress,
      child: Stack(
        fit: StackFit.expand,
        children: [
          FutureBuilder<String>(
            future: _decryptedFuture,
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return ColoredBox(
                  color: theme.colorScheme.surfaceContainerHighest,
                  child: const Center(
                    child: Icon(Icons.lock_outline_rounded,
                        color: Colors.redAccent),
                  ),
                );
              }
              final path = snapshot.data;
              if (path != null && path.isNotEmpty && File(path).existsSync()) {
                if (!isVideo) {
                  return Image.file(
                    File(path),
                    fit: BoxFit.cover,
                    cacheWidth: 420,
                  );
                } else {
                  return ColoredBox(
                    color: const Color(0xFF1B1D21),
                    child: Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.play_circle_fill,
                              color: Colors.white, size: 36),
                          const SizedBox(height: 6),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 4),
                            child: Text(
                              widget.file.name,
                              style: const TextStyle(
                                  color: Colors.white70,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w500),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }
              }
              return ColoredBox(
                color: theme.colorScheme.surfaceContainerHighest,
                child: const Center(
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              );
            },
          ),
          if (isVideo)
            const Positioned(
              left: 7,
              bottom: 6,
              child: Icon(Icons.videocam_rounded,
                  color: Colors.white,
                  size: 20,
                  shadows: [Shadow(blurRadius: 4)]),
            ),
          const Positioned(
            right: 6,
            bottom: 6,
            child: Icon(Icons.shield_outlined,
                color: Colors.white,
                size: 16,
                shadows: [Shadow(blurRadius: 4)]),
          ),
          if (widget.selectionMode)
            Positioned(
              top: 8,
              right: 8,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 120),
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: widget.selected
                      ? const Color(0xFFFFFFFF)
                      : const Color(0x66000000),
                  border:
                      Border.all(color: const Color(0xFFFFFFFF), width: 1.8),
                ),
                child: widget.selected
                    ? const Icon(Icons.check,
                        color: Color(0xFF111315), size: 15)
                    : null,
              ),
            ),
          if (widget.selected)
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                    border: Border.all(color: const Color(0xFFFFFFFF), width: 3)),
              ),
            ),
        ],
      ),
    );
  }
}
