import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../drive/domain/entities/drive_folder.dart';
import '../../../drive/presentation/providers/drive_provider.dart';
import '../../domain/entities/backup_rule.dart';
import '../providers/auto_backup_provider.dart';

/// Full-screen Auto Backup manager: folder → Telegram destination rules,
/// scheduling, network/power constraints, and live backup status.
class AutoBackupScreen extends ConsumerWidget {
  const AutoBackupScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(autoBackupProvider);
    final drive = ref.watch(driveProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Auto Backup',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
        children: [
          _StatusCard(state: state),
          const SizedBox(height: 20),
          _SectionLabel(text: 'Rules'),
          const SizedBox(height: 8),
          _RulesList(
            state: state,
            folders: drive.folders,
          ),
          const SizedBox(height: 24),
          _SectionLabel(text: 'When to back up'),
          const SizedBox(height: 8),
          _ConstraintsCard(state: state),
          const SizedBox(height: 24),
          _SectionLabel(text: 'Notifications'),
          const SizedBox(height: 8),
          _NotificationsCard(state: state),
          const SizedBox(height: 28),
          if (state.rules.isNotEmpty)
            FilledButton.icon(
              onPressed: state.scanning
                  ? null
                  : () => ref.read(autoBackupProvider.notifier).scanNow(),
              icon: state.scanning
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.cloud_upload_outlined),
              label: Text(state.scanning ? 'Backing up…' : 'Back up now'),
            ),
          const SizedBox(height: 12),
          Text(
            'New files in each watched folder are uploaded to its Telegram '
            'destination automatically. Already-backed-up files are skipped, '
            'and the next pass resumes where the last one stopped.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.6,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
      ),
    );
  }
}

class _StatusCard extends ConsumerWidget {
  const _StatusCard({required this.state});
  final AutoBackupState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final active = state.enabled && state.rules.where((r) => r.enabled).isNotEmpty;
    final lastBackup = state.lastBackupAt == null
        ? 'Never'
        : DateFormat('MMM d, h:mm a').format(state.lastBackupAt!.toLocal());

    String statusText;
    IconData statusIcon;
    if (!state.enabled) {
      statusText = 'Auto Backup is off';
      statusIcon = Icons.cloud_off_outlined;
    } else if (state.scanning) {
      statusText = 'Backing up…';
      statusIcon = Icons.sync_rounded;
    } else if (!active) {
      statusText = 'No active rules';
      statusIcon = Icons.info_outline;
    } else {
      statusText = 'Watching ${state.enabledRuleCount} '
          '${state.enabledRuleCount == 1 ? 'folder' : 'folders'}';
      statusIcon = Icons.backup_rounded;
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(statusIcon, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(width: 10),
            Expanded(
              child: Text(statusText,
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w600)),
            ),
            Switch(
              value: state.enabled,
              onChanged: (v) =>
                  ref.read(autoBackupProvider.notifier).setEnabled(v),
            ),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            _StatusChip(label: 'Last backup', value: lastBackup),
            const SizedBox(width: 12),
            _StatusChip(
              label: 'Pending',
              value: state.scanning
                  ? '${state.pendingCount}'
                  : (state.pendingCount > 0 ? '${state.pendingCount}' : '0'),
            ),
          ]),
          if (state.lastError != null) ...[
            const SizedBox(height: 12),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(Icons.error_outline,
                  size: 16, color: theme.colorScheme.error),
              const SizedBox(width: 6),
              Expanded(
                child: Text(state.lastError!,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.error)),
              ),
            ]),
          ],
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
              color: theme.colorScheme.outline.withValues(alpha: 0.4)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label.toUpperCase(),
                style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: theme.colorScheme.onSurfaceVariant)),
            const SizedBox(height: 2),
            Text(value,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _RulesList extends ConsumerWidget {
  const _RulesList({required this.state, required this.folders});
  final AutoBackupState state;
  final List<DriveFolder> folders;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (state.rules.isEmpty) {
      return const _EmptyRules();
    }
    return Column(
      children: [
        for (final rule in state.rules) ...[
          _RuleCard(rule: rule),
          const SizedBox(height: 10),
        ],
        OutlinedButton.icon(
          onPressed: () => _addOrEditRule(context, ref, folders),
          icon: const Icon(Icons.add),
          label: const Text('Add backup rule'),
        ),
      ],
    );
  }
}

class _EmptyRules extends StatelessWidget {
  const _EmptyRules();
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 24),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(children: [
        Icon(Icons.sync_alt_rounded,
            size: 40, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(height: 12),
        Text('No backup rules yet',
            style: theme.textTheme.titleSmall
                ?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        Text(
          'Link a phone folder to a Telegram destination and new files will '
          'upload automatically.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall,
        ),
      ]),
    );
  }
}

class _RuleCard extends ConsumerWidget {
  const _RuleCard({required this.rule});
  final BackupRule rule;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final dim = rule.enabled ? 1.0 : 0.45;
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
          child: Row(children: [
            Opacity(
              opacity: dim,
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: theme.colorScheme.surface,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                      color: theme.colorScheme.outline.withValues(alpha: 0.4)),
                ),
                child: Icon(Icons.folder_outlined,
                    color: theme.colorScheme.onSurfaceVariant),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Opacity(
                opacity: dim,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(rule.folderName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyLarge
                            ?.copyWith(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(rule.folderPath,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
            ),
            PopupMenuButton<String>(
              iconColor: theme.colorScheme.onSurfaceVariant,
              onSelected: (value) async {
                if (value == 'edit') {
                  await _addOrEditRule(context, ref, ref.read(driveProvider).folders,
                      existing: rule);
                } else if (value == 'toggle') {
                  await ref
                      .read(autoBackupProvider.notifier)
                      .toggleRule(rule.id);
                } else if (value == 'delete') {
                  final ok = await _confirmDelete(context, rule.folderName);
                  if (ok == true) {
                    await ref
                        .read(autoBackupProvider.notifier)
                        .deleteRule(rule.id);
                  }
                }
              },
              itemBuilder: (_) => [
                PopupMenuItem(
                    value: 'toggle',
                    child: Text(rule.enabled ? 'Disable' : 'Enable')),
                const PopupMenuItem(value: 'edit', child: Text('Edit')),
                const PopupMenuItem(value: 'delete', child: Text('Delete')),
              ],
            ),
          ]),
        ),
        const Divider(height: 1, indent: 16, endIndent: 16),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
          child: Row(children: [
            Icon(Icons.arrow_downward_rounded,
                size: 16, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(width: 8),
            Expanded(
              child: Opacity(
                opacity: dim,
                child: Text(
                  rule.telegramFolderTitle.isEmpty
                      ? rule.telegramFolderId
                      : rule.telegramFolderTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w500),
                ),
              ),
            ),
            Switch(
              value: rule.enabled,
              onChanged: (_) =>
                  ref.read(autoBackupProvider.notifier).toggleRule(rule.id),
            ),
          ]),
        ),
      ]),
    );
  }
}

class _ConstraintsCard extends ConsumerWidget {
  const _ConstraintsCard({required this.state});
  final AutoBackupState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(autoBackupProvider.notifier);
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(children: [
        SwitchListTile(
          secondary: const Icon(Icons.wifi_rounded),
          title: const Text('Wi-Fi only'),
          subtitle: const Text('Pause backups on mobile data'),
          value: state.wifiOnly,
          onChanged: notifier.setWifiOnly,
        ),
        if (!state.wifiOnly)
          SwitchListTile(
            secondary: const Icon(Icons.signal_cellular_alt_rounded),
            title: const Text('Allow mobile data'),
            subtitle: const Text('Back up over mobile networks'),
            value: state.mobileDataAllowed,
            onChanged: notifier.setMobileDataAllowed,
          ),
        const Divider(height: 1, indent: 16, endIndent: 16),
        SwitchListTile(
          secondary: const Icon(Icons.bolt_rounded),
          title: const Text('Only while charging'),
          subtitle: const Text('Avoid draining the battery'),
          value: state.chargingOnly,
          onChanged: notifier.setChargingOnly,
        ),
        const Divider(height: 1, indent: 16, endIndent: 16),
        ListTile(
          leading: const Icon(Icons.schedule_rounded),
          title: const Text('Backup frequency'),
          subtitle: Text(state.frequency.label),
          trailing: const Icon(Icons.chevron_right_rounded),
          onTap: () => _chooseFrequency(context, ref),
        ),
      ]),
    );
  }

  Future<void> _chooseFrequency(BuildContext context, WidgetRef ref) async {
    final choice = await showModalBottomSheet<BackupFrequency>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text('Backup frequency',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          ),
          const Divider(height: 1),
          for (final f in BackupFrequency.values)
            RadioListTile<BackupFrequency>(
              value: f,
              groupValue: ref.read(autoBackupProvider).frequency,
              title: Text(f.label),
              onChanged: (v) => Navigator.pop(ctx, v),
            ),
        ]),
      ),
    );
    if (choice != null) {
      await ref.read(autoBackupProvider.notifier).setFrequency(choice);
    }
  }
}

class _NotificationsCard extends ConsumerWidget {
  const _NotificationsCard({required this.state});
  final AutoBackupState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(autoBackupProvider.notifier);
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: SwitchListTile(
        secondary: const Icon(Icons.notifications_active_outlined),
        title: const Text('Backup notifications'),
        subtitle: const Text('Notify when files finish backing up or fail'),
        value: state.notifications,
        onChanged: notifier.setNotifications,
      ),
    );
  }
}

// ─── Add / edit rule sheet ──────────────────────────────────────────────────

Future<void> _addOrEditRule(
  BuildContext context,
  WidgetRef ref,
  List<DriveFolder> folders, {
  BackupRule? existing,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _AddRuleSheet(
      folders: folders,
      existing: existing,
    ),
  );
}

class _AddRuleSheet extends ConsumerStatefulWidget {
  const _AddRuleSheet({required this.folders, this.existing});
  final List<DriveFolder> folders;
  final BackupRule? existing;

  @override
  ConsumerState<_AddRuleSheet> createState() => _AddRuleSheetState();
}

class _AddRuleSheetState extends ConsumerState<_AddRuleSheet> {
  String? _folderPath;
  String _folderName = '';
  DriveFolder? _destination;
  bool _includeSubfolders = false;
  bool _picking = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    if (e != null) {
      _folderPath = e.folderPath;
      _folderName = e.folderName;
      _includeSubfolders = e.includeSubfolders;
      DriveFolder? found;
      for (final f in widget.folders) {
        if (f.id == e.telegramFolderId) {
          found = f;
          break;
        }
      }
      _destination = found;
    }
  }

  Future<void> _pickFolder() async {
    setState(() => _picking = true);
    try {
      final path = await FilePicker.platform.getDirectoryPath(
        dialogTitle: 'Choose a folder to back up',
      );
      if (path != null && mounted) {
        final name = path.replaceAll(RegExp(r'/+$'), '').split('/').last;
        setState(() {
          _folderPath = path;
          _folderName = name.isEmpty ? path : name;
        });
      }
    } catch (_) {
      // picker dismissed or unavailable
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  bool get _canSave =>
      _folderPath != null &&
      _folderPath!.isNotEmpty &&
      _destination != null &&
      !_saving;

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() => _saving = true);
    final notifier = ref.read(autoBackupProvider.notifier);
    try {
      if (widget.existing == null) {
        await notifier.addRule(
          folderPath: _folderPath!,
          folderName: _folderName,
          telegramFolderId: _destination!.id,
          telegramFolderTitle: _destination!.title,
          includeSubfolders: _includeSubfolders,
        );
      } else {
        await notifier.updateRule(widget.existing!.copyWith(
          folderPath: _folderPath!,
          folderName: _folderName,
          telegramFolderId: _destination!.id,
          telegramFolderTitle: _destination!.title,
          includeSubfolders: _includeSubfolders,
        ));
      }
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.toString()), backgroundColor: Colors.red));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                  widget.existing == null
                      ? 'New backup rule'
                      : 'Edit backup rule',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 16),
              // Folder selection
              Align(
                alignment: Alignment.centerLeft,
                child: Text('PHONE FOLDER',
                    style: theme.textTheme.labelSmall
                        ?.copyWith(fontWeight: FontWeight.w700)),
              ),
              const SizedBox(height: 8),
              InkWell(
                onTap: _picking ? null : _pickFolder,
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 14),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(children: [
                    Icon(_folderPath == null
                        ? Icons.create_new_folder_outlined
                        : Icons.folder_rounded),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _folderPath == null
                          ? Text(_picking ? 'Opening folder picker…'
                              : 'Choose a folder',
                              style: TextStyle(
                                  color: theme.colorScheme.onSurfaceVariant))
                          : Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(_folderName,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w600)),
                                Text(_folderPath!,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: theme.textTheme.bodySmall),
                              ],
                            ),
                    ),
                    if (_folderPath != null)
                      Icon(Icons.check_circle,
                          color: Theme.of(context).colorScheme.onSurface,
                          size: 20),
                  ]),
                ),
              ),
              const SizedBox(height: 12),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Include subfolders'),
                subtitle: const Text('Watch folders inside this one too'),
                value: _includeSubfolders,
                onChanged: (v) => setState(() => _includeSubfolders = v),
              ),
              const SizedBox(height: 8),
              // Destination selection
              Align(
                alignment: Alignment.centerLeft,
                child: Text('TELEGRAM DESTINATION',
                    style: theme.textTheme.labelSmall
                        ?.copyWith(fontWeight: FontWeight.w700)),
              ),
              const SizedBox(height: 8),
              InkWell(
                onTap: () => _chooseDestination(context),
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 14),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(children: [
                    Icon(_destination == null
                        ? Icons.cloud_upload_outlined
                        : (_destination!.isSavedMessages
                            ? Icons.bookmark_rounded
                            : Icons.folder_shared_outlined)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        _destination == null
                            ? 'Choose a destination'
                            : _destination!.title,
                        style: TextStyle(
                          color: _destination == null
                              ? theme.colorScheme.onSurfaceVariant
                              : null,
                          fontWeight: _destination == null
                              ? FontWeight.w400
                              : FontWeight.w600,
                        ),
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded),
                  ]),
                ),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _canSave ? _save : null,
                child: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(widget.existing == null ? 'Create rule' : 'Save'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _chooseDestination(BuildContext context) async {
    if (widget.folders.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'No Telegram destinations available. Create a folder first.')));
      return;
    }
    final choice = await showModalBottomSheet<DriveFolder>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text('Upload destination',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          ),
          const Divider(height: 1),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              children: widget.folders
                  .map((f) => ListTile(
                        leading: Icon(f.isSavedMessages
                            ? Icons.bookmark_rounded
                            : Icons.folder_outlined),
                        title: Text(f.title),
                        subtitle: Text(f.isSavedMessages
                            ? 'Saved Messages'
                            : 'Telegram channel'),
                        onTap: () => Navigator.pop(ctx, f),
                      ))
                  .toList(),
            ),
          ),
        ]),
      ),
    );
    if (choice != null) setState(() => _destination = choice);
  }
}

Future<bool?> _confirmDelete(BuildContext context, String name) {
  return showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Delete rule?'),
      content: Text(
          '“$name” will stop backing up automatically. Already uploaded files '
          'stay in Telegram.'),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel')),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: Colors.red),
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Delete'),
        ),
      ],
    ),
  );
}
