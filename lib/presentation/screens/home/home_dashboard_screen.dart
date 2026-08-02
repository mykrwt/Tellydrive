import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../state/file_list_providers.dart';
import '../../widgets/storage_ring.dart';
import '../settings/settings_screen.dart';
import '../favorites/favorites_screen.dart';
import '../recents/recents_screen.dart';

/// The Home tab: an iCloud/Google-One-style dashboard showing storage
/// usage at a glance, quick links to Favorites/Recents, and a quick
/// "Back Up Now" action — the first thing a user sees after signing in.
class HomeDashboardScreen extends ConsumerWidget {
  const HomeDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(storageStatsProvider);

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar.large(
            title: const Text('TellyBase'),
            actions: [
              IconButton(
                icon: const Icon(CupertinoIcons.gear_alt),
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const SettingsScreen()),
                ),
              ),
            ],
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  statsAsync.when(
                    data: (stats) => StorageRing(byCategory: stats.byCategory, totalBytes: stats.totalBytes),
                    loading: () => const SizedBox(height: 200, child: Center(child: CircularProgressIndicator())),
                    error: (e, _) => SizedBox(height: 200, child: Center(child: Text('$e'))),
                  ),
                  const SizedBox(height: 28),
                  _QuickActionsRow(),
                  const SizedBox(height: 28),
                  statsAsync.when(
                    data: (stats) => _CategoryBreakdown(stats: stats),
                    loading: () => const SizedBox.shrink(),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                  const SizedBox(height: 16),
                  const _InfoBanner(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickActionsRow extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _QuickAction(
            icon: CupertinoIcons.star_fill,
            label: 'Favorites',
            color: AppColors.systemYellow,
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const FavoritesScreen())),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _QuickAction(
            icon: CupertinoIcons.clock_fill,
            label: 'Recents',
            color: AppColors.systemBlue,
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RecentsScreen())),
          ),
        ),
      ],
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({required this.icon, required this.label, required this.color, required this.onTap});
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 18),
        decoration: BoxDecoration(
          color: AppTheme.surfaceOf(context),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 26),
            const SizedBox(height: 8),
            Text(label, style: Theme.of(context).textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }
}

class _CategoryBreakdown extends StatelessWidget {
  const _CategoryBreakdown({required this.stats});
  final StorageStats stats;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(color: AppTheme.surfaceOf(context), borderRadius: BorderRadius.circular(18)),
      child: Column(
        children: stats.byCategory.entries.map((e) {
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                Text(e.key.label, style: Theme.of(context).textTheme.bodyLarge),
                const Spacer(),
                Text(_human(e.value), style: Theme.of(context).textTheme.bodyMedium),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  String _human(int bytes) {
    if (bytes <= 0) return '0 MB';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var value = bytes.toDouble();
    var i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return '${value.toStringAsFixed(1)} ${units[i]}';
  }
}

class _InfoBanner extends StatelessWidget {
  const _InfoBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.systemBlue.withOpacity(0.08),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          const Icon(CupertinoIcons.lock_shield, color: AppColors.systemBlue),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Everything above lives only in your own Telegram account. '
              'TellyBase has no server of its own.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }
}
