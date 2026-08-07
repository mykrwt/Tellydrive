import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';

/// Backup & Sync: auto-upload the device gallery at original quality.
class BackupScreen extends ConsumerWidget {
  const BackupScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final backup = ref.watch(backupControllerProvider);
    final controller = ref.read(backupControllerProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Backup & Sync', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          SwitchListTile(
            secondary: const Icon(Icons.backup_outlined),
            title: const Text('Backup & Sync'),
            subtitle: const Text(
              'Automatically upload new photos and videos at original quality.',
            ),
            value: backup.enabled,
            onChanged: controller.setEnabled,
          ),
          SwitchListTile(
            secondary: const Icon(Icons.wifi),
            title: const Text('Only over Wi-Fi'),
            subtitle: const Text('Skip backups on mobile data.'),
            value: backup.wifiOnly,
            onChanged: controller.setWifiOnly,
          ),
          const Divider(),
          ListTile(
            title: Text(
              backup.lastBackupCount == null
                  ? 'No backups yet'
                  : 'Last backup uploaded ${backup.lastBackupCount} item(s)',
            ),
            trailing: FilledButton.tonalIcon(
              onPressed: backup.isRunning ? null : controller.runNow,
              icon: backup.isRunning
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.play_arrow),
              label: Text(backup.isRunning ? 'Backing up…' : 'Back up now'),
            ),
          ),
          if (backup.error != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                backup.error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
        ],
      ),
    );
  }
}
