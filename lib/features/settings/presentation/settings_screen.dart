import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../auth/presentation/auth_state.dart';

/// App settings: theme, cache controls, and sign-out.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsControllerProvider);
    final settingsController = ref.read(settingsControllerProvider.notifier);
    final auth = ref.watch(authControllerProvider);
    final name = auth is AuthAuthenticated ? auth.session.firstName : '';
    final phone = auth is AuthAuthenticated ? (auth.session.phone ?? '') : '';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          ListTile(
            leading: CircleAvatar(child: Text(name.isNotEmpty ? name[0] : '?')),
            title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(phone),
          ),
          const Divider(),
          SwitchListTile(
            secondary: const Icon(Icons.dark_mode_outlined),
            title: const Text('Dark mode'),
            value: settings.darkMode,
            onChanged: settingsController.setDarkMode,
          ),
          ListTile(
            leading: const Icon(Icons.cleaning_services_outlined),
            title: const Text('Clear media cache'),
            subtitle: const Text('Remove locally cached thumbnails (re-downloaded on demand).'),
            onTap: () async {
              await settingsController.clearCache();
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Media cache cleared')),
                );
              }
            },
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout),
            title: const Text('Sign out'),
            subtitle: const Text('Keep your library in Telegram; log back in to restore it.'),
            onTap: () async {
              await ref.read(authControllerProvider.notifier).signOut();
            },
          ),
        ],
      ),
    );
  }
}
