import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

/// Lets the user pick which device folders (Camera, Downloads, Documents,
/// custom paths) are automatically watched for new/changed files — the
/// configuration surface for the "Automatic background backup of selected
/// folders" requirement, driving [BackgroundScheduler] +
/// [IncrementalScanner].
class SmartBackupSettingsScreen extends StatefulWidget {
  const SmartBackupSettingsScreen({super.key});

  @override
  State<SmartBackupSettingsScreen> createState() => _SmartBackupSettingsScreenState();
}

class _SmartBackupSettingsScreenState extends State<SmartBackupSettingsScreen> {
  final _folders = <String, bool>{
    'Camera Roll': true,
    'Downloads': false,
    'Documents': true,
    'WhatsApp Media': false,
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Smart Backup')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'TellyBase watches these folders in the background and uploads only new or changed files — nothing else is scanned.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          Card(
            child: Column(
              children: _folders.entries.map((e) {
                return SwitchListTile(
                  title: Text(e.key),
                  value: e.value,
                  activeColor: AppColors.systemBlue,
                  onChanged: (v) => setState(() => _folders[e.key] = v),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 16),
          ListTile(
            leading: const Icon(CupertinoIcons.folder_badge_plus, color: AppColors.systemBlue),
            title: const Text('Add Custom Folder'),
            onTap: () {},
          ),
        ],
      ),
    );
  }
}
