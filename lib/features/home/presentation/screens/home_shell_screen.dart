import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';

import '../../../../core/routing/app_router.dart';
import '../../../files/presentation/screens/files_screen.dart';
import '../../../gallery/presentation/screens/gallery_screen.dart';
import '../../../settings/presentation/screens/settings_screen.dart';

/// The authenticated application shell. These are intentionally the only
/// bottom-level destinations.
class HomeShellScreen extends StatefulWidget {
  const HomeShellScreen({super.key});

  @override
  State<HomeShellScreen> createState() => _HomeShellScreenState();
}

class _HomeShellScreenState extends State<HomeShellScreen> {
  int _index = 0;
  StreamSubscription<List<SharedMediaFile>>? _shareSubscription;

  static const _pages = <Widget>[
    GalleryScreen(),
    FilesScreen(),
    SettingsScreen(embedded: true),
  ];

  @override
  void initState() {
    super.initState();
    _shareSubscription = ReceiveSharingIntent.instance.getMediaStream().listen(_openSharedFiles);
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final files = await ReceiveSharingIntent.instance.getInitialMedia();
      if (files.isNotEmpty) _openSharedFiles(files);
      ReceiveSharingIntent.instance.reset();
    });
  }

  void _openSharedFiles(List<SharedMediaFile> files) {
    if (!mounted || files.isEmpty) return;
    context.push(AppRoutes.shareToDrive, extra: files);
  }

  @override
  void dispose() {
    _shareSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _pages),
      bottomNavigationBar: NavigationBar(
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
