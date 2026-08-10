import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/utils/file_utils.dart';
import '../../../../services/platform/native_telegram_channel.dart';
import '../../../../services/security/app_lock_service.dart';
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
  // Local cached setting values, loaded once from SharedPreferences.
  bool _uploadsWifiOnly = false;
  bool _galleryAutoplay = true;
  bool _galleryPinchZoom = true;
  int _galleryColumns = 3;
  bool _transferNotifications = true;
  bool _confirmBeforeDelete = true;
  bool _appLock = false;
  bool _loaded = false;

  // Storage panel state.
  int? _cacheBytes;
  bool _clearing = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _uploadsWifiOnly = prefs.getBool(PrefKeys.uploadsWifiOnly) ?? false;
      _galleryAutoplay = prefs.getBool(PrefKeys.galleryAutoplay) ?? true;
      _galleryPinchZoom = prefs.getBool(PrefKeys.galleryPinchZoom) ?? true;
      _galleryColumns = prefs.getInt(PrefKeys.galleryColumns) ?? 3;
      _transferNotifications =
          prefs.getBool(PrefKeys.transferNotifications) ?? true;
      _confirmBeforeDelete = prefs.getBool(PrefKeys.confirmBeforeDelete) ?? true;
      _appLock = prefs.getBool(PrefKeys.appLockEnabled) ?? false;
      _loaded = true;
    });
    unawaited(_refreshCacheSize());
  }

  Future<void> _refreshCacheSize() async {
    try {
      final bytes = await NativeTelegramChannel.getCacheSizeBytes();
      if (mounted) setState(() => _cacheBytes = bytes);
    } catch (_) {
      if (mounted) setState(() => _cacheBytes = 0);
    }
  }

  Future<void> _save(String key, bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(key, value);
  }

  Future<void> _clearCache() async {
    setState(() => _clearing = true);
    try {
      await NativeTelegramChannel.optimizeStorage();
      await _refreshCacheSize();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Cache cleared')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.toString()), backgroundColor: Colors.red));
      }
    } finally {
      if (mounted) setState(() => _clearing = false);
    }
  }

  Future<void> _toggleAppLock(bool value) async {
    if (value) {
      final available = await AppLockService.instance.isAvailable();
      if (!available) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text(
                  'Biometric or screen lock isn’t set up on this device.')));
        }
        return;
      }
      final ok = await AppLockService.instance
          .authenticate(reason: 'Confirm to enable app lock');
      if (!ok) return;
    }
    await AppLockService.instance.setEnabled(value);
    if (mounted) setState(() => _appLock = value);
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(userProfileProvider);
    final ftp = ref.watch(ftpServerProvider);
    final theme = ref.watch(themeModeProvider);
    final backup = ref.watch(autoBackupProvider);

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: !widget.embedded,
        title: const Text('Settings',
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
      ),
      body: !_loaded
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 110),
              children: [
                // ── Account ──────────────────────────────────────────────
                _Section(
                  title: 'Account',
                  children: [
                    profile.when(
                      data: (user) {
                        final name =
                            '${user['firstName'] ?? ''} ${user['lastName'] ?? ''}'
                                .trim();
                        return ListTile(
                          leading: _Avatar(path: user['photoPath']?.toString()),
                          title: Text(name.isEmpty ? 'Telegram user' : name),
                          subtitle: Text(_phone(user['phoneNumber']?.toString())),
                        );
                      },
                      loading: () => const ListTile(
                          leading: CircularProgressIndicator(),
                          title: Text('Loading Telegram account…')),
                      error: (_, __) => const ListTile(
                          leading: Icon(Icons.person_outline),
                          title: Text('Telegram account'),
                          subtitle: Text('Unable to read profile')),
                    ),
                    ListTile(
                      leading: const Icon(Icons.logout, color: Colors.red),
                      title: const Text('Log out',
                          style: TextStyle(color: Colors.red)),
                      subtitle: const Text(
                          'End this Telegram session on this device'),
                      onTap: _logout,
                    ),
                  ],
                ),

                // ── Backup ──────────────────────────────────────────────
                _Section(
                  title: 'Backup',
                  description: 'Automatically back up phone folders to Telegram.',
                  children: [
                    SwitchListTile(
                      secondary: const Icon(Icons.backup_outlined),
                      title: const Text('Auto Backup'),
                      subtitle: Text(backup.enabled
                          ? 'On • ${backup.rules.where((r) => r.enabled).length} active '
                              '${backup.rules.where((r) => r.enabled).length == 1 ? 'rule' : 'rules'}'
                          : 'Off'),
                      value: backup.enabled,
                      onChanged: (v) =>
                          ref.read(autoBackupProvider.notifier).setEnabled(v),
                    ),
                    ListTile(
                      leading: const Icon(Icons.rule_folder_outlined),
                      title: const Text('Backup rules'),
                      subtitle: Text(backup.rules.isEmpty
                          ? 'Folder → Telegram destination'
                          : '${backup.rules.length} '
                              '${backup.rules.length == 1 ? 'rule' : 'rules'}'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => context.push(AppRoutes.autoBackup),
                    ),
                  ],
                ),

                // ── Downloads & Storage ─────────────────────────────────
                _Section(
                  title: 'Downloads & Storage',
                  children: [
                    SwitchListTile(
                      secondary: const Icon(Icons.wifi),
                      title: const Text('Upload on Wi-Fi only'),
                      subtitle: const Text(
                          'Applies to uploads started manually in the app'),
                      value: _uploadsWifiOnly,
                      onChanged: (value) {
                        setState(() => _uploadsWifiOnly = value);
                        _save(PrefKeys.uploadsWifiOnly, value);
                      },
                    ),
                    const Divider(height: 1, indent: 56),
                    ListTile(
                      leading: const Icon(Icons.sd_storage_outlined),
                      title: const Text('Downloads'),
                      subtitle: const Text('Saved to Downloads/TeleDrive'),
                    ),
                    const Divider(height: 1, indent: 56),
                    ListTile(
                      leading: _clearing
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.cleaning_services_outlined),
                      title: const Text('Clear cache'),
                      subtitle: Text(_cacheBytes == null
                          ? 'Calculating…'
                          : 'Telegram cache • ${SizeFormatter.format(_cacheBytes!)}'),
                      onTap: _clearing ? null : _clearCache,
                    ),
                  ],
                ),

                // ── Gallery ─────────────────────────────────────────────
                _Section(
                  title: 'Gallery',
                  children: [
                    SwitchListTile(
                      secondary: const Icon(Icons.play_circle_outline),
                      title: const Text('Autoplay videos'),
                      subtitle: const Text(
                          'Play automatically in the full-screen viewer'),
                      value: _galleryAutoplay,
                      onChanged: (value) {
                        setState(() => _galleryAutoplay = value);
                        _save(PrefKeys.galleryAutoplay, value);
                      },
                    ),
                    const Divider(height: 1, indent: 56),
                    ListTile(
                      leading: const Icon(Icons.grid_view_rounded),
                      title: const Text('Default grid size'),
                      subtitle: Text('$_galleryColumns columns'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: _chooseGridSize,
                    ),
                    const Divider(height: 1, indent: 56),
                    SwitchListTile(
                      secondary: const Icon(Icons.zoom_in_rounded),
                      title: const Text('Pinch to zoom'),
                      subtitle:
                          const Text('Pinch the gallery to change grid size'),
                      value: _galleryPinchZoom,
                      onChanged: (value) {
                        setState(() => _galleryPinchZoom = value);
                        _save(PrefKeys.galleryPinchZoom, value);
                      },
                    ),
                  ],
                ),

                // ── Files ───────────────────────────────────────────────
                _Section(
                  title: 'Files',
                  children: [
                    ListTile(
                      leading: const Icon(Icons.view_module_outlined),
                      title: const Text('Default view'),
                      subtitle:
                          Text(ref.watch(defaultViewModeProvider) == 'grid'
                              ? 'Grid'
                              : 'List'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: _chooseFileView,
                    ),
                    const Divider(height: 1, indent: 56),
                    SwitchListTile(
                      secondary: const Icon(Icons.delete_outline),
                      title: const Text('Confirm before deleting'),
                      subtitle:
                          const Text('Ask before removing files or folders'),
                      value: _confirmBeforeDelete,
                      onChanged: (value) {
                        setState(() => _confirmBeforeDelete = value);
                        _save(PrefKeys.confirmBeforeDelete, value);
                      },
                    ),
                  ],
                ),

                // ── Notifications ───────────────────────────────────────
                _Section(
                  title: 'Notifications',
                  children: [
                    SwitchListTile(
                      secondary: const Icon(Icons.notifications_outlined),
                      title: const Text('Transfer notifications'),
                      subtitle: const Text(
                          'Upload, download, and error status'),
                      value: _transferNotifications,
                      onChanged: (value) {
                        setState(() => _transferNotifications = value);
                        _save(PrefKeys.transferNotifications, value);
                      },
                    ),
                  ],
                ),

                // ── Privacy & Security ──────────────────────────────────
                _Section(
                  title: 'Privacy & Security',
                  children: [
                    SwitchListTile(
                      secondary: const Icon(Icons.lock_outline),
                      title: const Text('App lock'),
                      subtitle: const Text(
                          'Require biometrics to open TeleDrive'),
                      value: _appLock,
                      onChanged: _toggleAppLock,
                    ),
                  ],
                ),

                // ── Local access (FTP) ──────────────────────────────────
                _FtpSection(
                  state: ftp,
                  onConfigure: _configureFtp,
                  onToggle: ftp.running
                      ? ref.read(ftpServerProvider.notifier).stop
                      : ref.read(ftpServerProvider.notifier).start,
                ),

                // ── Appearance ──────────────────────────────────────────
                _Section(
                  title: 'Appearance',
                  children: [
                    ListTile(
                      leading: const Icon(Icons.palette_outlined),
                      title: const Text('Theme'),
                      subtitle: Text(_themeName(theme)),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: _chooseTheme,
                    ),
                  ],
                ),

                // ── About ───────────────────────────────────────────────
                const _Section(
                  title: 'About',
                  children: [
                    ListTile(
                      leading: Icon(Icons.info_outline),
                      title: Text('TeleDrive'),
                      subtitle: Text(
                          'Version ${AppConstants.appVersion}\nTelegram-backed gallery and file manager'),
                      isThreeLine: true,
                    ),
                    ListTile(
                      leading:
                          Icon(Icons.favorite_rounded, color: Colors.red),
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
      builder: (context) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Text('Appearance',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        ),
        const Divider(height: 1),
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

  Future<void> _chooseGridSize() async {
    final choice = await showModalBottomSheet<int>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Text('Default grid size',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        ),
        const Divider(height: 1),
        for (var c = 2; c <= 8; c++)
          RadioListTile<int>(
            value: c,
            groupValue: _galleryColumns,
            title: Text('$c columns'),
            onChanged: (value) => Navigator.pop(context, value),
          ),
      ])),
    );
    if (choice == null) return;
    setState(() => _galleryColumns = choice);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(PrefKeys.galleryColumns, choice);
  }

  Future<void> _chooseFileView() async {
    final current = ref.read(defaultViewModeProvider);
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Text('Default file view',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        ),
        const Divider(height: 1),
        RadioListTile(
            value: 'list',
            groupValue: current,
            title: const Text('List'),
            onChanged: (value) => Navigator.pop(context, value)),
        RadioListTile(
            value: 'grid',
            groupValue: current,
            title: const Text('Grid'),
            onChanged: (value) => Navigator.pop(context, value)),
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
        content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: user, decoration: const InputDecoration(labelText: 'Username')),
          const SizedBox(height: 10),
          TextField(
              controller: password,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password')),
          const SizedBox(height: 10),
          TextField(
              controller: port,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Port')),
          const SizedBox(height: 14),
          const Text(
              'FTP is intended for a trusted local network. The password is stored in encrypted device storage.',
              style: TextStyle(fontSize: 12)),
        ])),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Save')),
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
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(error.toString()), backgroundColor: Colors.red));
        }
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
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Log out')),
        ],
      ),
    );
    if (yes != true) return;
    await ref.read(ftpServerProvider.notifier).stop();
    await ref.read(autoBackupProvider.notifier).setEnabled(false);
    await ref.read(authProvider.notifier).logout();
    if (mounted) context.go(AppRoutes.welcome);
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
      title: 'Local access',
      description: 'Share your Telegram storage over FTP on your local network.',
      children: [
        ListTile(
          leading: Icon(state.running
              ? Icons.cloud_done_outlined
              : Icons.cloud_off_outlined),
          title: const Text('FTP server'),
          subtitle: Text(state.running
              ? 'ftp://${state.host}:${state.port}'
              : 'Stopped'),
          trailing: _StatusDot(
              label: state.running ? 'Running' : 'Stopped',
              color: state.running ? Colors.green : Colors.grey),
        ),
        ListTile(
          leading: const Icon(Icons.badge_outlined),
          title: Text(state.username),
          subtitle: Text(
              'Port ${state.port} • Password ${state.password.isEmpty ? 'not configured' : 'configured'}'),
          trailing: const Icon(Icons.edit_outlined),
          enabled: !state.running && !state.loading,
          onTap: onConfigure,
        ),
        if (state.error != null)
          Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
              child: Text(state.error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error))),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
                backgroundColor: state.running ? Colors.red : null,
                minimumSize: const Size.fromHeight(46)),
            onPressed: state.loading ? null : onToggle,
            icon: state.loading
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : Icon(state.running ? Icons.stop : Icons.play_arrow),
            label: Text(state.running ? 'Stop server' : 'Start server'),
          ),
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children, this.description});
  final String title;
  final String? description;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 22),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 4),
          child: Text(title.toUpperCase(),
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6,
                  color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ),
        if (description != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
            child: Text(description!,
                style: Theme.of(context).textTheme.bodySmall),
          )
        else
          const SizedBox(height: 4),
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
        Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 6),
        Text(label, style: const TextStyle(fontSize: 12)),
      ]);
}
