import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/routing/app_router.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../../drive/presentation/providers/drive_provider.dart';
import '../providers/auto_backup_provider.dart';
import '../providers/ftp_server_provider.dart';
import '../providers/settings_provider.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key, this.embedded = false});
  final bool embedded;

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _wifiOnly = false;
  bool _galleryAutoplay = true;
  bool _notifications = true;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _wifiOnly = prefs.getBool('uploads_wifi_only') ?? false;
      _galleryAutoplay = prefs.getBool('gallery_autoplay') ?? true;
      _notifications = prefs.getBool('transfer_notifications') ?? true;
      _loaded = true;
    });
  }

  Future<void> _saveBool(String key, bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(key, value);
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(userProfileProvider);
    final ftp = ref.watch(ftpServerProvider);
    final theme = ref.watch(themeModeProvider);
    final drive = ref.watch(driveProvider);
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: !widget.embedded,
        title: const Text('Settings', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
      ),
      body: !_loaded
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 110),
              children: [
                _Section(
                  title: 'Account',
                  children: [
                    profile.when(
                      data: (user) => ListTile(
                        leading: _Avatar(path: user['photoPath']?.toString()),
                        title: Text('${user['firstName'] ?? ''} ${user['lastName'] ?? ''}'.trim().isEmpty ? 'Telegram user' : '${user['firstName'] ?? ''} ${user['lastName'] ?? ''}'.trim()),
                        subtitle: Text(_phone(user['phoneNumber']?.toString())),
                      ),
                      loading: () => const ListTile(leading: CircularProgressIndicator(), title: Text('Loading Telegram account…')),
                      error: (_, __) => const ListTile(leading: Icon(Icons.person_outline), title: Text('Telegram account'), subtitle: Text('Unable to read profile')),
                    ),
                    ListTile(
                      leading: const Icon(Icons.logout, color: Colors.red),
                      title: const Text('Log out', style: TextStyle(color: Colors.red)),
                      subtitle: const Text('End this Telegram session on this device'),
                      onTap: _logout,
                    ),
                  ],
                ),
                _Section(
                  title: 'Upload/download settings',
                  children: [
                    SwitchListTile(
                      secondary: const Icon(Icons.wifi),
                      title: const Text('Upload on Wi-Fi only'),
                      subtitle: const Text('Applies to uploads started in the app'),
                      value: _wifiOnly,
                      onChanged: (value) {
                        setState(() => _wifiOnly = value);
                        _saveBool('uploads_wifi_only', value);
                      },
                    ),
                    const ListTile(
                      leading: Icon(Icons.layers_outlined),
                      title: Text('Large-file uploads'),
                      subtitle: Text('Direct up to 2 GB; larger files resume in ordered Telegram chunks'),
                    ),
                    const ListTile(
                      leading: Icon(Icons.download_outlined),
                      title: Text('Download location'),
                      subtitle: Text('Public Downloads/TeleDrive'),
                    ),
                  ],
                ),
                _Section(
                  title: 'Gallery settings',
                  children: [
                    SwitchListTile(
                      secondary: const Icon(Icons.play_circle_outline),
                      title: const Text('Autoplay videos'),
                      subtitle: const Text('Play when opened in the full-screen viewer'),
                      value: _galleryAutoplay,
                      onChanged: (value) {
                        setState(() => _galleryAutoplay = value);
                        _saveBool('gallery_autoplay', value);
                      },
                    ),
                    const ListTile(
                      leading: Icon(Icons.grid_3x3),
                      title: Text('Gallery grid'),
                      subtitle: Text('Pinch to zoom • choose grid size'),
                    ),
                  ],
                ),
                _Section(
                  title: 'File manager settings',
                  children: [
                    ListTile(
                      leading: const Icon(Icons.view_module_outlined),
                      title: const Text('Default view'),
                      subtitle: Text(ref.watch(defaultViewModeProvider) == 'grid' ? 'Grid' : 'List'),
                      onTap: _chooseFileView,
                    ),
                    const ListTile(
                      leading: Icon(Icons.visibility_off_outlined),
                      title: Text('Internal chunk files'),
                      subtitle: Text('Always hidden from Gallery, Files, and FTP'),
                    ),
                  ],
                ),
                _Section(
                  title: 'Appearance',
                  children: [
                    ListTile(
                      leading: const Icon(Icons.palette_outlined),
                      title: const Text('Theme'),
                      subtitle: Text(_themeName(theme)),
                      onTap: _chooseTheme,
                    ),
                  ],
                ),
                _Section(
                  title: 'Notifications',
                  children: [
                    SwitchListTile(
                      secondary: const Icon(Icons.notifications_outlined),
                      title: const Text('Transfer notifications'),
                      subtitle: const Text('Upload, download, and error status'),
                      value: _notifications,
                      onChanged: (value) {
                        setState(() => _notifications = value);
                        _saveBool('transfer_notifications', value);
                      },
                    ),
                  ],
                ),
                _AutoBackupSection(drive: drive),
                _FtpSection(
                  state: ftp,
                  onConfigure: _configureFtp,
                  onToggle: ftp.running
                      ? ref.read(ftpServerProvider.notifier).stop
                      : ref.read(ftpServerProvider.notifier).start,
                ),
                const _Section(
                  title: 'About',
                  children: [
                    ListTile(
                      leading: Icon(Icons.info_outline),
                      title: Text('TeleDrive'),
                      subtitle: Text('Version ${AppConstants.appVersion}\nTelegram-backed gallery and file manager'),
                      isThreeLine: true,
                    ),
                    ListTile(
                      leading: Icon(Icons.favorite_rounded, color: Colors.red),
                      title: Text('Made with ❤️ by @myk.rwt'),
                      subtitle: Text('Crafted with care for a premium experience'),
                    ),
                  ],
                ),
              ],
            ),
    );
  }

  String _phone(String? value) {
    if (value == null || value.isEmpty) return 'Telegram account';
    return value.startsWith('+') ? value : '+$value';
  }

  String _themeName(ThemeMode mode) => switch (mode) {
        ThemeMode.light => 'Light',
        ThemeMode.dark => 'Dark',
        ThemeMode.system => 'Use device setting',
      };

  Future<void> _chooseTheme() async {
    final choice = await showModalBottomSheet<ThemeMode>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const ListTile(title: Text('Appearance', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700))),
        for (final mode in ThemeMode.values)
          RadioListTile<ThemeMode>(
            value: mode,
            groupValue: ref.read(themeModeProvider),
            title: Text(_themeName(mode)),
            onChanged: (value) => Navigator.pop(context, value),
          ),
      ])),
    );
    if (choice == null) return;
    ref.read(themeModeProvider.notifier).state = choice;
    await SettingsService.saveTheme(choice);
  }

  Future<void> _chooseFileView() async {
    final current = ref.read(defaultViewModeProvider);
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const ListTile(title: Text('Default file view', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700))),
        RadioListTile(value: 'list', groupValue: current, title: const Text('List'), onChanged: (value) => Navigator.pop(context, value)),
        RadioListTile(value: 'grid', groupValue: current, title: const Text('Grid'), onChanged: (value) => Navigator.pop(context, value)),
      ])),
    );
    if (choice == null) return;
    ref.read(defaultViewModeProvider.notifier).state = choice;
    await SettingsService.saveViewMode(choice);
    final drive = ref.read(driveProvider);
    final target = choice == 'grid' ? ViewMode.grid : ViewMode.list;
    if (drive.viewMode != target) ref.read(driveProvider.notifier).toggleViewMode();
  }

  Future<void> _configureFtp() async {
    final state = ref.read(ftpServerProvider);
    if (state.running) return;
    final user = TextEditingController(text: state.username);
    final password = TextEditingController(text: state.password);
    final port = TextEditingController(text: state.port.toString());
    final save = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('FTP server configuration'),
        content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: user, decoration: const InputDecoration(labelText: 'Username')),
          const SizedBox(height: 10),
          TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
          const SizedBox(height: 10),
          TextField(controller: port, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Port')),
          const SizedBox(height: 14),
          const Text('FTP is intended for a trusted local network. The password is stored in encrypted device storage.', style: TextStyle(fontSize: 12)),
        ])),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
        ],
      ),
    );
    if (save == true) {
      try {
        await ref.read(ftpServerProvider.notifier).configure(
          username: user.text,
          password: password.text,
          port: int.tryParse(port.text) ?? 0,
        );
      } catch (error) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString()), backgroundColor: Colors.red));
      }
    }
    user.dispose();
    password.dispose();
    port.dispose();
  }

  Future<void> _logout() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Log out?'),
        content: const Text('Telegram cloud files are not deleted.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Log out')),
        ],
      ),
    );
    if (yes != true) return;
    await ref.read(ftpServerProvider.notifier).stop();
    await ref.read(authProvider.notifier).logout();
    if (mounted) context.go(AppRoutes.welcome);
  }
}

class _AutoBackupSection extends ConsumerWidget {
  const _AutoBackupSection({required this.drive});
  final DriveState drive;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(autoBackupProvider);
    final notifier = ref.read(autoBackupProvider.notifier);
    final selectedCount = state.selectedFolderIds.length;
    return _Section(
      title: 'Automatic backup',
      children: [
        SwitchListTile(
          secondary: const Icon(Icons.backup_outlined),
          title: const Text('Auto Backup'),
          subtitle: Text(state.enabled ? 'Enabled • backs up selected folders' : 'Disabled'),
          value: state.enabled,
          onChanged: (v) => notifier.setEnabled(v),
        ),
        ListTile(
          leading: const Icon(Icons.folder_copy_outlined),
          title: const Text('Select folders to back up'),
          subtitle: Text(selectedCount == 0 ? 'No folders selected' : '$selectedCount folder(s) selected'),
          trailing: const Icon(Icons.chevron_right_rounded),
          enabled: state.enabled,
          onTap: state.enabled ? () => _chooseFolders(context, ref) : null,
        ),
        if (state.enabled && selectedCount > 0)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Text(
              'Auto backup will keep the selected folders in sync in the background. You can change the selection anytime.',
              style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
          ),
      ],
    );
  }

  Future<void> _chooseFolders(BuildContext context, WidgetRef ref) async {
    final folders = ref.read(driveProvider).folders;
    final current = Set<String>.from(ref.read(autoBackupProvider).selectedFolderIds);
    final temp = Set<String>.from(current);
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => SafeArea(
          child: Padding(
            padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const ListTile(title: Text('Choose folders to back up automatically', style: TextStyle(fontWeight: FontWeight.w700))),
                const Divider(height: 1),
                Flexible(
                  child: ListView(
                    shrinkWrap: true,
                    children: folders.map((f) {
                      final selected = temp.contains(f.id);
                      return CheckboxListTile(
                        value: selected,
                        title: Text(f.title),
                        subtitle: Text(f.isSavedMessages ? 'Saved Messages' : 'Channel folder'),
                        onChanged: (v) => setLocal(() {
                          if (v == true) {
                            temp.add(f.id);
                          } else {
                            temp.remove(f.id);
                          }
                        }),
                      );
                    }).toList(),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  child: Row(
                    children: [
                      Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel'))),
                      const SizedBox(width: 12),
                      Expanded(child: FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save'))),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (confirmed == true) {
      await ref.read(autoBackupProvider.notifier).setFolders(temp);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(temp.isEmpty ? 'Auto backup: no folders selected' : 'Auto backup: ${temp.length} folder(s) will be backed up')));
      }
    }
  }
}

class _FtpSection extends StatelessWidget {
  const _FtpSection({required this.state, required this.onConfigure, required this.onToggle});
  final FtpServerState state;
  final VoidCallback onConfigure;
  final Future<void> Function() onToggle;

  @override
  Widget build(BuildContext context) {
    return _Section(
      title: 'FTP server',
      children: [
        ListTile(
          leading: Icon(state.running ? Icons.cloud_done_outlined : Icons.cloud_off_outlined),
          title: const Text('Server status'),
          subtitle: Text(state.running ? 'ftp://${state.host}:${state.port}' : 'Stopped'),
          trailing: _StatusDot(label: state.running ? 'Running' : 'Stopped', color: state.running ? Colors.green : Colors.grey),
        ),
        ListTile(
          leading: const Icon(Icons.badge_outlined),
          title: Text(state.username),
          subtitle: Text('Port ${state.port} • Password ${state.password.isEmpty ? 'not configured' : 'configured'}'),
          trailing: const Icon(Icons.edit_outlined),
          enabled: !state.running && !state.loading,
          onTap: onConfigure,
        ),
        if (state.error != null)
          Padding(padding: const EdgeInsets.fromLTRB(16, 4, 16, 10), child: Text(state.error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
          child: FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: state.running ? Colors.red : null, minimumSize: const Size.fromHeight(46)),
            onPressed: state.loading ? null : onToggle,
            icon: state.loading ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Icon(state.running ? Icons.stop : Icons.play_arrow),
            label: Text(state.running ? 'Stop server' : 'Start server'),
          ),
        ),
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 0, 16, 14),
          child: Text('The FTP root shows the same Telegram folders and files as Files. Downloads are fetched on demand; no full local mirror is created.', style: TextStyle(fontSize: 12)),
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 7),
          child: Text(title.toUpperCase(), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Theme.of(context).colorScheme.primary)),
        ),
        Card(
          margin: EdgeInsets.zero,
          clipBehavior: Clip.antiAlias,
          child: Column(children: [
            for (var i = 0; i < children.length; i++) ...[
              children[i],
              if (i != children.length - 1) const Divider(height: 1, indent: 56),
            ],
          ]),
        ),
      ]),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({this.path});
  final String? path;
  @override
  Widget build(BuildContext context) {
    if (path != null && path!.isNotEmpty && File(path!).existsSync()) {
      return CircleAvatar(backgroundImage: FileImage(File(path!)));
    }
    return const CircleAvatar(child: Icon(Icons.person));
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.label, required this.color});
  final String label;
  final Color color;
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
    Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
    const SizedBox(width: 6),
    Text(label, style: const TextStyle(fontSize: 12)),
  ]);
}
