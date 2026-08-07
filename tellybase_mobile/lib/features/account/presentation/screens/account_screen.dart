import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tellybase_mobile/core/utils/file_formatters.dart';
import 'package:tellybase_mobile/core/widgets/premium_card.dart';
import 'package:tellybase_mobile/features/admin/presentation/screens/admin_screen.dart';
import 'package:tellybase_mobile/features/auth/presentation/controllers/auth_controller.dart';
import 'package:tellybase_mobile/features/dashboard/presentation/controllers/dashboard_controller.dart';
import 'package:tellybase_mobile/features/dashboard/presentation/widgets/storage_overview_card.dart';

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final user = auth.valueOrNull;
    final summary = ref.watch(dashboardSummaryProvider);
    if (user == null) return const SizedBox.shrink();
    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.refresh(dashboardSummaryProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 34),
          children: [
            PremiumCard(
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 31,
                    backgroundColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.16),
                    child: Text(
                      user.initials,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(color: Theme.of(context).colorScheme.primary),
                    ),
                  ),
                  const SizedBox(width: 15),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(user.name, style: Theme.of(context).textTheme.titleLarge),
                        const SizedBox(height: 3),
                        Text(user.email, maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 7),
                        Row(
                          children: [
                            Icon(Icons.verified_user_outlined, size: 16, color: Theme.of(context).colorScheme.secondary),
                            const SizedBox(width: 5),
                            Text(
                              user.isAdmin
                                  ? 'Administrator'
                                  : user.premiumActive
                                      ? 'Premium member'
                                      : 'Private member',
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            summary.when(
              data: (value) => Column(
                children: [
                  StorageOverviewCard(summary: value),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(child: _Metric(icon: Icons.photo_outlined, value: '${value.photoCount}', label: 'Photos')),
                      const SizedBox(width: 11),
                      Expanded(child: _Metric(icon: Icons.movie_outlined, value: '${value.videoCount}', label: 'Videos')),
                    ],
                  ),
                ],
              ),
              loading: () => const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
              error: (error, _) => ListTile(
                leading: const Icon(Icons.cloud_off_outlined),
                title: const Text('Storage summary unavailable'),
                subtitle: Text(error.toString()),
                trailing: IconButton(onPressed: () => ref.invalidate(dashboardSummaryProvider), icon: const Icon(Icons.refresh_rounded)),
              ),
            ),
            const SizedBox(height: 24),
            Text('Workspace', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 9),
            if (user.isAdmin)
              _SettingsTile(
                icon: Icons.admin_panel_settings_outlined,
                color: const Color(0xFF8995FF),
                title: 'Admin workspace',
                subtitle: 'Users, storage, roles, and system health',
                onTap: () => Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => const AdminScreen())),
              ),
            _SettingsTile(
              icon: Icons.policy_outlined,
              color: user.storageEnabled ? const Color(0xFF58D5C9) : const Color(0xFFFF7D8A),
              title: 'Backend authority',
              subtitle:
                  '${user.accountStatus} · ${user.subscriptionTier}/${user.subscriptionStatus} · storage ${user.storageEnabled ? 'enabled' : 'disabled'}',
              onTap: () => _securityInfo(context),
            ),
            _SettingsTile(
              icon: Icons.security_rounded,
              color: const Color(0xFF58D5C9),
              title: 'Security',
              subtitle: 'Encrypted local session and server-side credentials',
              onTap: () => _securityInfo(context),
            ),
            _SettingsTile(
              icon: Icons.info_outline_rounded,
              color: const Color(0xFFF0AF55),
              title: 'About TellyBase',
              subtitle: 'Android 1.0.0 · Native Flutter client',
              onTap: () => showAboutDialog(
                context: context,
                applicationName: 'TellyBase',
                applicationVersion: '1.0.0',
                applicationLegalese: 'Private cloud storage. Infrastructure credentials remain on the server.',
              ),
            ),
            const SizedBox(height: 18),
            OutlinedButton.icon(
              onPressed: auth.isLoading ? null : () => _signOut(context, ref),
              icon: const Icon(Icons.logout_rounded),
              label: const Text('Sign out'),
            ),
            const SizedBox(height: 18),
            Center(
              child: Text(
                'Member since ${FileFormatters.date(user.createdAt)}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _securityInfo(BuildContext context) => showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (context) => const SafeArea(
          child: Padding(
            padding: EdgeInsets.fromLTRB(24, 4, 24, 30),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Built for private storage', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                SizedBox(height: 14),
                ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.password_rounded), title: Text('Passwords are hashed server-side'), subtitle: Text('Plaintext passwords are never stored.')),
                ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.phonelink_lock_rounded), title: Text('Session protected on device'), subtitle: Text('The Android Keystore protects your signed session.')),
                ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.key_off_outlined), title: Text('No infrastructure secrets in the app'), subtitle: Text('Backend credentials stay in server-only modules.')),
              ],
            ),
          ),
        ),
      );

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('Your private files remain safely stored. You can sign back in at any time.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out')),
        ],
      ),
    );
    if (confirmed == true) await ref.read(authControllerProvider.notifier).signOut();
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.icon, required this.value, required this.label});
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: Theme.of(context).colorScheme.primary),
          const SizedBox(height: 14),
          Text(value, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
          Text(label),
        ],
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  const _SettingsTile({required this.icon, required this.color, required this.title, required this.subtitle, required this.onTap});
  final Color color;
  final IconData icon;
  final VoidCallback onTap;
  final String subtitle;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: ListTile(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        tileColor: Theme.of(context).colorScheme.surfaceContainer,
        leading: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(13)),
          child: Icon(icon, color: color),
        ),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right_rounded),
        onTap: onTap,
      ),
    );
  }
}
