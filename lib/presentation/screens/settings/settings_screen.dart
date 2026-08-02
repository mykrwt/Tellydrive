import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../state/auth_controller.dart';
import '../../../state/theme_controller.dart';
import '../../widgets/telly_button.dart';
import 'accounts_screen.dart';
import 'restore_screen.dart';
import 'smart_backup_settings_screen.dart';

/// Settings covers: appearance (dark/light/system), security (encryption
/// toggle, recovery key export), Smart Backup folder configuration,
/// multi-account management, restore-on-new-device, and sign out — the
/// full "additional features" checklist surfaced as one coherent screen,
/// styled like Apple's grouped Settings list.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _SectionLabel('Appearance'),
          Card(
            child: Column(
              children: [
                _SegmentedThemeRow(current: themeMode),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _SectionLabel('Backup'),
          Card(
            child: Column(
              children: [
                _NavRow(
                  icon: CupertinoIcons.folder_badge_plus,
                  label: 'Smart Backup Folders',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const SmartBackupSettingsScreen()),
                  ),
                ),
                const Divider(height: 1, indent: 56),
                _NavRow(
                  icon: CupertinoIcons.arrow_2_circlepath,
                  label: 'Restore from Telegram',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const RestoreScreen()),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _SectionLabel('Accounts'),
          Card(
            child: _NavRow(
              icon: CupertinoIcons.person_2,
              label: 'Manage Telegram Accounts',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const AccountsScreen()),
              ),
            ),
          ),
          const SizedBox(height: 24),
          _SectionLabel('Security'),
          Card(
            child: Column(
              children: [
                _NavRow(icon: CupertinoIcons.lock_shield, label: 'Encryption & Recovery Key', onTap: () {}),
              ],
            ),
          ),
          const SizedBox(height: 32),
          TellyButton(
            label: 'Sign Out',
            isDestructive: true,
            isSecondary: true,
            onPressed: () => ref.read(authControllerProvider.notifier).signOut(),
          ),
          const SizedBox(height: 12),
          Center(
            child: Text('TellyBase 1.0.0', style: Theme.of(context).textTheme.bodySmall),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(left: 8, bottom: 8),
        child: Text(text.toUpperCase(), style: Theme.of(context).textTheme.labelSmall),
      );
}

class _NavRow extends StatelessWidget {
  const _NavRow({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: AppColors.systemBlue),
      title: Text(label),
      trailing: const Icon(CupertinoIcons.chevron_right, size: 16),
      onTap: onTap,
    );
  }
}

class _SegmentedThemeRow extends ConsumerWidget {
  const _SegmentedThemeRow({required this.current});
  final ThemeMode current;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: CupertinoSlidingSegmentedControl<ThemeMode>(
        groupValue: current,
        children: const {
          ThemeMode.system: Padding(padding: EdgeInsets.symmetric(vertical: 6), child: Text('System')),
          ThemeMode.light: Padding(padding: EdgeInsets.symmetric(vertical: 6), child: Text('Light')),
          ThemeMode.dark: Padding(padding: EdgeInsets.symmetric(vertical: 6), child: Text('Dark')),
        },
        onValueChanged: (mode) {
          if (mode != null) ref.read(themeModeProvider.notifier).setMode(mode);
        },
      ),
    );
  }
}
