import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';

import '../../../../core/routing/app_router.dart';
import '../../../../services/security/app_lock_service.dart';
import '../../../files/presentation/screens/files_screen.dart';
import '../../../gallery/presentation/screens/gallery_screen.dart';
import '../../../settings/presentation/providers/auto_backup_provider.dart';
import '../../../settings/presentation/screens/settings_screen.dart';

/// The authenticated application shell. These are intentionally the only
/// bottom-level destinations.
class HomeShellScreen extends ConsumerStatefulWidget {
  const HomeShellScreen({super.key});

  @override
  ConsumerState<HomeShellScreen> createState() => _HomeShellScreenState();
}

class _HomeShellScreenState extends ConsumerState<HomeShellScreen>
    with WidgetsBindingObserver {
  int _index = 0;
  StreamSubscription<List<SharedMediaFile>>? _shareSubscription;

  // App lock state.
  bool _lockEnabled = false;
  bool _locked = false;
  // Re-entrancy guard: init, resume, and the manual Unlock button can all
  // trigger an auth prompt; local_auth throws if a second prompt starts while
  // one is active, which would falsely keep the app locked.
  bool _unlocking = false;

  static const _pages = <Widget>[
    GalleryScreen(),
    FilesScreen(),
    SettingsScreen(embedded: true),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _shareSubscription = ReceiveSharingIntent.instance.getMediaStream().listen(_openSharedFiles);
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final files = await ReceiveSharingIntent.instance.getInitialMedia();
      if (files.isNotEmpty) _openSharedFiles(files);
      ReceiveSharingIntent.instance.reset();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(autoBackupProvider.notifier);
      _initAppLock();
    });
  }

  Future<void> _initAppLock() async {
    final enabled = await AppLockService.instance.isEnabled();
    if (!mounted) return;
    setState(() => _lockEnabled = enabled);
    if (enabled) {
      setState(() => _locked = true);
      await _tryUnlock();
    }
  }

  Future<void> _tryUnlock() async {
    if (_unlocking) return;
    _unlocking = true;
    try {
      final ok = await AppLockService.instance.authenticate(reason: 'Unlock TeleDrive');
      if (!mounted) return;
      setState(() => _locked = !ok);
    } finally {
      _unlocking = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Auto Backup: pick up files added while backgrounded.
      ref.read(autoBackupProvider.notifier).onAppResumed();
      // App lock: re-lock when returning from background if enabled.
      if (_lockEnabled) {
        setState(() => _locked = true);
        _tryUnlock();
      }
    }
  }

  void _openSharedFiles(List<SharedMediaFile> files) {
    if (!mounted || files.isEmpty) return;
    context.push(AppRoutes.shareToDrive, extra: files);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _shareSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Watch so the monitor state is kept alive while the app is running.
    ref.watch(autoBackupProvider);
    final theme = Theme.of(context);
    return Scaffold(
      body: Stack(children: [
        IndexedStack(index: _index, children: _pages),
        if (_locked)
          Positioned.fill(
            child: Container(
              color: theme.scaffoldBackgroundColor,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.lock_outline_rounded,
                          size: 56,
                          color: theme.colorScheme.onSurfaceVariant),
                      const SizedBox(height: 18),
                      Text('TeleDrive is locked',
                          style: theme.textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 8),
                      Text('Authenticate to continue',
                          style: theme.textTheme.bodySmall),
                      const SizedBox(height: 24),
                      FilledButton.icon(
                        onPressed: _tryUnlock,
                        icon: const Icon(Icons.fingerprint_rounded),
                        label: const Text('Unlock'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ]),
      bottomNavigationBar: _locked
          ? null
          : NavigationBar(
              selectedIndex: _index,
              onDestinationSelected: (value) => setState(() => _index = value),
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.photo_library_outlined),
                  selectedIcon: Icon(Icons.photo_library_rounded),
                  label: 'Gallery',
                ),
                NavigationDestination(
                  icon: Icon(Icons.folder_outlined),
                  selectedIcon: Icon(Icons.folder_rounded),
                  label: 'Files',
                ),
                NavigationDestination(
                  icon: Icon(Icons.settings_outlined),
                  selectedIcon: Icon(Icons.settings_rounded),
                  label: 'Settings',
                ),
              ],
            ),
    );
  }
}
