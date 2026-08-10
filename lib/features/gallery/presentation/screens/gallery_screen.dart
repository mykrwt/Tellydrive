import 'dart:async';
import 'dart:io';

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
import '../../../vault/presentation/providers/vault_provider.dart';
import '../../../vault/presentation/screens/vault_login_screen.dart';
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

  // Smooth, continuous pinch-to-zoom. [_targetColumns] is a fractional column
  // count the gesture writes to; the grid interpolates toward it so resizing
  // never jumps. Apple-style: pinch out (expand) → zoom in → fewer/larger
  // tiles; pinch in (contract) → zoom out → more/smaller tiles.
  static const _minColumns = 2.0;
  static const _maxColumns = 8.0;
  double _targetColumns = 3.0;
  double _pinchBase = 3.0;
  int _lastColumnHint = 3;
  bool _showZoomHint = false;
  bool _pinchEnabled = true;
  Timer? _hintTimer;

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

  Future<bool> _confirmDelete(int count) async {
    final prefs = await SharedPreferences.getInstance();
    if (!(prefs.getBool(PrefKeys.confirmBeforeDelete) ?? true)) return true;
    if (!mounted) return false;
    return await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: Text(count == 1 ? 'Delete this item?' : 'Delete $count items?'),
            content: const Text(
                'This permanently deletes the Telegram messages and cannot be undone.'),
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
  }

  Future<void> _delete(List<DriveFile> files) async {
    if (files.isEmpty) return;
    if (!await _confirmDelete(files.length)) return;
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

  Future<void> _moveToVault(List<DriveFile> files) async {
    if (files.isEmpty) return;
    final vaultState = ref.read(vaultProvider);
    if (!vaultState.isUnlocked || vaultState.unlockedKey == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please unlock your Hidden Vault first.')),
      );
      _openVaultLogin(context);
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(vaultProvider.notifier).moveFromGalleryToVault(files);
      if (mounted) {
        setState(_selected.clear);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${files.length} item(s) encrypted and moved to Hidden Vault.')),
        );
      }
    } catch (error) {
      if (mounted) _showError(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  bool _vaultLoginOpen = false;

  void _openVaultLogin(BuildContext context) {
    if (_vaultLoginOpen) return;
    _vaultLoginOpen = true;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => const VaultLoginScreen(),
      ),
    ).whenComplete(() {
      _vaultLoginOpen = false;
    });
  }

  @override
  void initState() {
    super.initState();
    _loadPrefs();
  }

  Future<void> _loadPrefs() async {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
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
    });
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
    // Only react to genuine two-finger scaling, not incidental drag.
    if ((details.scale - 1).abs() < 0.02) return;
    final desired = (_pinchBase / details.scale).clamp(_minColumns, _maxColumns);
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

  void _showError(Object error) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error.toString()), backgroundColor: Colors.red),
    );
  }

  // Pull-down-and-hold opens the Hidden Vault: pull past the refresh distance
  // and keep holding for a moment. Works with any number of photos — including
  // zero — because the scrollables use AlwaysScrollableScrollPhysics.
  double _pullAccum = 0;
  Timer? _pullHoldTimer;
  static const _vaultPullDistance = 130.0;
  static const _vaultHoldDuration = Duration(milliseconds: 650);

  void _cancelPullHold() {
    _pullHoldTimer?.cancel();
    _pullHoldTimer = null;
  }

  void _handleScrollNotification(ScrollNotification notification) {
    if (notification is ScrollStartNotification) {
      // Start tracking only if the finger grabbed the list at the very top.
      _pullAccum = 0;
      _cancelPullHold();
    } else if (notification is ScrollUpdateNotification) {
      final details = notification.dragDetails;
      final atTop = notification.metrics.extentBefore <= 0 &&
          notification.metrics.pixels <= 0;
      if (details != null && atTop && details.delta.dy > 0) {
        _pullAccum += details.delta.dy;
        if (_pullAccum >= _vaultPullDistance && _pullHoldTimer == null) {
          _pullHoldTimer = Timer(_vaultHoldDuration, () {
            _pullHoldTimer = null;
            if (!_vaultLoginOpen) {
              HapticFeedback.heavyImpact();
              _openVaultLogin(context);
            }
          });
        } else if (_pullAccum < _vaultPullDistance) {
          // Finger reversed direction before passing the threshold — disarm.
          _cancelPullHold();
        }
      }
    } else if (notification is ScrollEndNotification) {
      // Finger lifted (this also lets RefreshIndicator do a normal refresh).
      _pullAccum = 0;
      _cancelPullHold();
    }
  }

  @override
  void dispose() {
    _cancelPullHold();
    _hintTimer?.cancel();
    super.dispose();
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
      body: NotificationListener<ScrollNotification>(
        onNotification: (notification) {
          _handleScrollNotification(notification);
          return false;
        },
        child: Stack(
          children: [
            RefreshIndicator(
              onRefresh: ref.read(galleryProvider.notifier).refresh,
              child: state.isLoading && state.media.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                : state.error != null && state.media.isEmpty
                    ? _MessageState(
                        icon: Icons.cloud_off_outlined,
                        title: 'Couldn’t load gallery',
                        message: state.error!,
                        actionLabel: 'Retry',
                        onAction: ref.read(galleryProvider.notifier).refresh,
                      )
                    : state.media.isEmpty
                        ? _VaultTriggerArea(
                            onTrigger: () => _openVaultLogin(context),
                            child: const _MessageState(
                              icon: Icons.photo_library_outlined,
                              title: 'No photos or videos yet',
                              message:
                                  'Media you upload or back up to Telegram will appear here.',
                            ),
                          )
                        : GestureDetector(
                            onScaleStart: _handleScaleStart,
                            onScaleUpdate: _handleScaleUpdate,
                            onScaleEnd: _handleScaleEnd,
                            child: _AnimatedGrid(
                              targetColumns: _targetColumns,
                              groups: groups,
                              selected: _selected,
                              selectionMode: selectionMode,
                              onToggle: _toggle,
                              onVaultTrigger: () => _openVaultLogin(context),
                              onOpen: (file) {
                                final itemIndex = state.media.indexOf(file);
                                Navigator.of(context).push(MaterialPageRoute(
                                  builder: (_) => GalleryViewerScreen(
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
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.78),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.grid_view_rounded, color: Colors.white, size: 16),
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
            const Positioned.fill(
                child: ColoredBox(
                    color: Color(0x66000000),
                    child: Center(child: CircularProgressIndicator()))),
        ],
      ),
      ),
      bottomNavigationBar: selectionMode
          ? SafeArea(
              child: SizedBox(
                height: 58,
                child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                  IconButton(tooltip: 'Share', onPressed: _busy ? null : () => _share(selectedFiles), icon: const Icon(Icons.ios_share)),
                  IconButton(tooltip: 'Download', onPressed: _busy ? null : () => _download(selectedFiles), icon: const Icon(Icons.download_outlined)),
                  IconButton(tooltip: 'Move to Hidden Vault', onPressed: _busy ? null : () => _moveToVault(selectedFiles), icon: const Icon(Icons.lock_outline_rounded)),
                  IconButton(tooltip: 'Delete', onPressed: _busy ? null : () => _delete(selectedFiles), icon: const Icon(Icons.delete_outline, color: Colors.red)),
                ]),
              ),
            )
          : null,
    );
  }
}

/// Grid whose column count smoothly animates toward [targetColumns]. Using a
/// fractional, interpolated value (with a max-cross-axis-extent delegate) is
/// what makes resizing feel continuous instead of snapping between sizes.
class _AnimatedGrid extends StatelessWidget {
  const _AnimatedGrid({
    required this.targetColumns,
    required this.groups,
    required this.selected,
    required this.selectionMode,
    required this.onToggle,
    required this.onVaultTrigger,
    required this.onOpen,
  });

  final double targetColumns;
  final Map<String, List<DriveFile>> groups;
  final Set<String> selected;
  final bool selectionMode;
  final void Function(DriveFile) onToggle;
  final VoidCallback onVaultTrigger;
  final void Function(DriveFile) onOpen;

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 3, end: targetColumns),
      duration: const Duration(milliseconds: 160),
      curve: Curves.easeOutCubic,
      builder: (context, columns, _) {
        // Convert the fractional column count into a max extent so the grid
        // reflows smoothly; the integer column count tracks it automatically.
        final extent = (screenWidth / columns).clamp(48.0, screenWidth / 1.5);
        return CustomScrollView(
          // Always-scrollable so pull-to-refresh (and the pull-and-hold vault
          // trigger) work even when there are too few photos to fill the screen.
          physics: const AlwaysScrollableScrollPhysics(),
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
                    return _GalleryTile(
                      file: file,
                      selected:
                          selected.contains('${file.folderId}:${file.id}'),
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
            SliverToBoxAdapter(
              child: _VaultTriggerArea(
                onTrigger: onVaultTrigger,
                child: const SizedBox(height: 120, width: double.infinity),
              ),
            ),
            const SliverPadding(padding: EdgeInsets.only(bottom: 24)),
          ],
        );
      },
    );
  }
}

class _MessageState extends StatelessWidget {
  const _MessageState({
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });
  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      // Must stay scrollable so the enclosing RefreshIndicator can always be
      // pulled, even for measured states that don't fill the viewport.
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 150),
        Icon(icon, size: 56, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(height: 16),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Text(title,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w600)),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Text(message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall),
        ),
        if (actionLabel != null && onAction != null) ...[
          const SizedBox(height: 20),
          Center(
            child: OutlinedButton(onPressed: onAction, child: Text(actionLabel!)),
          ),
        ],
      ],
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
    final isIncomplete = widget.file.isIncomplete;
    return GestureDetector(
      onTap: () {
        if (isIncomplete) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('This file is incomplete — upload was interrupted. Delete or re-upload to fix.')),
          );
          return;
        }
        widget.onTap();
      },
      onLongPress: widget.onLongPress,
      child: Stack(fit: StackFit.expand, children: [
        FutureBuilder<String?>(
          future: _thumbnail,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return ColoredBox(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                child: Icon(Icons.broken_image_outlined, color: Theme.of(context).colorScheme.onSurfaceVariant),
              );
            }
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
        if (isIncomplete)
          Positioned.fill(
            child: Container(
              color: Colors.black.withValues(alpha: 0.56),
              child: const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.warning_amber_rounded, color: Colors.white, size: 28),
                  SizedBox(height: 4),
                  Text('Incomplete', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          ),
        if (!isIncomplete && widget.file.type == DriveFileType.video)
          const Positioned(left: 7, bottom: 6, child: Icon(Icons.play_circle_fill, color: Colors.white, size: 22, shadows: [Shadow(blurRadius: 4)])),
        if (!isIncomplete && widget.file.isChunked)
          const Positioned(right: 6, bottom: 6, child: Icon(Icons.layers_rounded, color: Colors.white, size: 18, shadows: [Shadow(blurRadius: 4)])),
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
                color: widget.selected ? const Color(0xFFFFFFFF) : const Color(0x66000000),
                border: Border.all(color: const Color(0xFFFFFFFF), width: 1.8),
              ),
              child: widget.selected ? const Icon(Icons.check, color: Color(0xFF111315), size: 15) : null,
            ),
          ),
        if (widget.selected)
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(border: Border.all(color: const Color(0xFFFFFFFF), width: 3)),
            ),
          ),
      ]),
    );
  }
}

class _VaultTriggerArea extends StatefulWidget {
  const _VaultTriggerArea({required this.onTrigger, required this.child});
  final VoidCallback onTrigger;
  final Widget child;

  @override
  State<_VaultTriggerArea> createState() => _VaultTriggerAreaState();
}

class _VaultTriggerAreaState extends State<_VaultTriggerArea> {
  Timer? _timer;

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer(const Duration(milliseconds: 2000), () {
      HapticFeedback.heavyImpact();
      widget.onTrigger();
    });
  }

  void _cancelTimer() {
    _timer?.cancel();
    _timer = null;
  }

  @override
  void dispose() {
    _cancelTimer();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Deliberate long-press only — a plain sustained touch (started via
    // onTapDown previously) must not wander into the Hidden Vault.
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onLongPressStart: (_) => _startTimer(),
      onLongPressEnd: (_) => _cancelTimer(),
      onLongPressCancel: () => _cancelTimer(),
      child: widget.child,
    );
  }
}

