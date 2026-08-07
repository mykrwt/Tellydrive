import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/transfers/transfer_controller.dart';
import '../../albums/presentation/albums_screen.dart';
import '../../auth/presentation/auth_state.dart';
import '../../backup/presentation/backup_screen.dart';
import '../../downloads/presentation/downloads_screen.dart';
import '../../favorites/presentation/favorites_screen.dart';
import '../../settings/presentation/settings_screen.dart';
import '../../storage/presentation/storage_screen.dart';
import '../../trash/presentation/trash_screen.dart';
import 'library_selectors.dart';

/// The "Library" tab: a hub of albums-independent sections (Favorites,
/// Downloads, Storage, Trash) plus Settings and account info.
class LibraryScreen extends ConsumerWidget {
  const LibraryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final favorites = ref.watch(favoriteItemsProvider).length;
    final albums = ref.watch(albumsProvider).length;
    final trashed = ref.watch(trashedItemsProvider).length;
    final activeTransfers = ref
        .watch(transferControllerProvider)
        .where((t) =>
            t.state == TransferState.queued || t.state == TransferState.running)
        .length;

    final auth = ref.watch(authControllerProvider);
    final name = auth is AuthAuthenticated ? auth.session.firstName : '';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Library', style: TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync),
            tooltip: 'Sync now',
            onPressed: () =>
                ref.read(libraryControllerProvider.notifier).syncFromTelegram(),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.only(top: 4),
        children: [
          if (name.isNotEmpty)
            ListTile(
              leading: CircleAvatar(child: Text(name.isNotEmpty ? name[0] : '?')),
              title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: const Text('Backed up to your Telegram account'),
            ),
          const Divider(),
          _SectionTile(
            icon: Icons.favorite_outline,
            title: 'Favorites',
            count: favorites,
            onTap: () => _push(context, const FavoritesScreen()),
          ),
          _SectionTile(
            icon: Icons.download_outlined,
            title: 'Downloads',
            count: activeTransfers,
            onTap: () => _push(context, const DownloadsScreen()),
          ),
          _SectionTile(
            icon: Icons.cloud_outlined,
            title: 'Storage',
            onTap: () => _push(context, const StorageScreen()),
          ),
          _SectionTile(
            icon: Icons.delete_outline,
            title: 'Trash',
            count: trashed,
            onTap: () => _push(context, const TrashScreen()),
          ),
          _SectionTile(
            icon: Icons.photo_album_outlined,
            title: 'Albums',
            count: albums,
            onTap: () => _push(context, const AlbumsScreen()),
          ),
          const Divider(),
          _SectionTile(
            icon: Icons.backup_outlined,
            title: 'Backup & Sync',
            onTap: () => _push(context, const BackupScreen()),
          ),
          _SectionTile(
            icon: Icons.settings_outlined,
            title: 'Settings',
            onTap: () => _push(context, const SettingsScreen()),
          ),
        ],
      ),
    );
  }

  void _push(BuildContext context, Widget page) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
  }
}

class _SectionTile extends StatelessWidget {
  const _SectionTile({
    required this.icon,
    required this.title,
    required this.onTap,
    this.count,
  });

  final IconData icon;
  final String title;
  final VoidCallback onTap;
  final int? count;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return ListTile(
      leading: Icon(icon, color: colors.primary),
      title: Text(title),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (count != null && count! > 0)
            Text(
              '$count',
              style: TextStyle(color: colors.onSurfaceVariant),
            ),
          const Icon(Icons.chevron_right),
        ],
      ),
      onTap: onTap,
    );
  }
}
