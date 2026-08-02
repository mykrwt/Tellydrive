import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../backup/backup_queue_screen.dart';
import '../files/files_screen.dart';
import '../gallery/gallery_screen.dart';
import '../search/search_screen.dart';
import 'home_dashboard_screen.dart';

/// TellyBase's main navigation shell — a bottom tab bar exactly in the
/// spirit of Files/Photos on iOS: Home (dashboard + storage stats),
/// Gallery, Files (folder browser), Search, and Backup (queue/progress).
class RootShell extends StatefulWidget {
  const RootShell({super.key});

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  int _index = 0;

  static const _screens = [
    HomeDashboardScreen(),
    GalleryScreen(),
    FilesScreen(),
    BackupQueueScreen(),
    SearchScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(CupertinoIcons.house), selectedIcon: Icon(CupertinoIcons.house_fill), label: 'Home'),
          NavigationDestination(icon: Icon(CupertinoIcons.photo), selectedIcon: Icon(CupertinoIcons.photo_fill), label: 'Gallery'),
          NavigationDestination(icon: Icon(CupertinoIcons.folder), selectedIcon: Icon(CupertinoIcons.folder_fill), label: 'Files'),
          NavigationDestination(icon: Icon(CupertinoIcons.arrow_up_arrow_down_circle), selectedIcon: Icon(CupertinoIcons.arrow_up_arrow_down_circle_fill), label: 'Backup'),
          NavigationDestination(icon: Icon(CupertinoIcons.search), selectedIcon: Icon(CupertinoIcons.search), label: 'Search'),
        ],
      ),
    );
  }
}
