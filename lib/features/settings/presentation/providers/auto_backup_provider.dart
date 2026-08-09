import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../services/platform/native_telegram_channel.dart';
import '../../../drive/presentation/providers/drive_provider.dart';
import '../../domain/entities/backup_rule.dart';

/// How often the in-app backup monitor scans the watched folders.
enum BackupFrequency {
  /// Every 30 minutes.
  frequent('Every 30 minutes', 30),
  hourly('Hourly', 60),
  every6Hours('Every 6 hours', 360),
  daily('Daily', 1440);

  const BackupFrequency(this.label, this.minutes);
  final String label;
  final int minutes;
}

/// State for the Auto Backup feature.
class AutoBackupState {
  /// Global kill switch. When false no scanning or uploading happens.
  final bool enabled;

  /// Only back up while connected to Wi-Fi.
  final bool wifiOnly;

  /// Permit backing up over mobile data (only meaningful when [wifiOnly] is
  /// false). When [wifiOnly] is false and this is false, the monitor waits
  /// for Wi-Fi too.
  final bool mobileDataAllowed;

  /// Only back up while the device is charging.
  final bool chargingOnly;

  final BackupFrequency frequency;

  /// Show Android notifications for backup progress / failures. Honoured by
  /// the upload notification helper when notifications are enabled at the OS
  /// level.
  final bool notifications;

  final List<BackupRule> rules;

  /// Timestamp of the last successful backup pass (any file uploaded).
  final DateTime? lastBackupAt;

  /// Files discovered in the last scan that have not been backed up yet.
  final int pendingCount;

  /// A scan pass is currently running.
  final bool scanning;

  /// Last non-fatal failure message (a single rule failing doesn't abort the
  /// whole pass). Null when everything is healthy.
  final String? lastError;

  const AutoBackupState({
    this.enabled = false,
    this.wifiOnly = true,
    this.mobileDataAllowed = false,
    this.chargingOnly = false,
    this.frequency = BackupFrequency.hourly,
    this.notifications = true,
    this.rules = const [],
    this.lastBackupAt,
    this.pendingCount = 0,
    this.scanning = false,
    this.lastError,
  });

  int get enabledRuleCount => rules.where((r) => r.enabled).length;

  AutoBackupState copyWith({
    bool? enabled,
    bool? wifiOnly,
    bool? mobileDataAllowed,
    bool? chargingOnly,
    BackupFrequency? frequency,
    bool? notifications,
    List<BackupRule>? rules,
    DateTime? lastBackupAt,
    bool clearLastBackupAt = false,
    int? pendingCount,
    bool? scanning,
    String? lastError,
    bool clearError = false,
  }) {
    return AutoBackupState(
      enabled: enabled ?? this.enabled,
      wifiOnly: wifiOnly ?? this.wifiOnly,
      mobileDataAllowed: mobileDataAllowed ?? this.mobileDataAllowed,
      chargingOnly: chargingOnly ?? this.chargingOnly,
      frequency: frequency ?? this.frequency,
      notifications: notifications ?? this.notifications,
      rules: rules ?? this.rules,
      lastBackupAt: clearLastBackupAt ? null : (lastBackupAt ?? this.lastBackupAt),
      pendingCount: pendingCount ?? this.pendingCount,
      scanning: scanning ?? this.scanning,
      lastError: clearError ? null : (lastError ?? this.lastError),
    );
  }
}

class AutoBackupNotifier extends StateNotifier<AutoBackupState> {
  AutoBackupNotifier(this._ref) : super(const AutoBackupState()) {
    _load();
  }

  final Ref _ref;
  Timer? _timer;
  bool _disposed = false;

  // Re-entry guard for the scan pass.
  bool _scanRunning = false;

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final rawRules = prefs.getStringList(PrefKeys.autoBackupRules) ?? const [];
    final rules = <BackupRule>[];
    for (final raw in rawRules) {
      try {
        rules.add(BackupRule.decode(raw));
      } catch (_) {}
    }
    final lastAtMs = prefs.getInt(PrefKeys.autoBackupLastAt);
    final freqIndex = prefs.getInt(PrefKeys.autoBackupFrequency);
    state = state.copyWith(
      enabled: prefs.getBool(PrefKeys.autoBackupEnabled) ?? false,
      wifiOnly: prefs.getBool(PrefKeys.autoBackupWifiOnly) ?? true,
      mobileDataAllowed: prefs.getBool(PrefKeys.autoBackupMobileData) ?? false,
      chargingOnly: prefs.getBool(PrefKeys.autoBackupChargingOnly) ?? false,
      frequency: BackupFrequency.values.firstWhere(
        (e) => e.index == freqIndex,
        orElse: () => BackupFrequency.hourly,
      ),
      notifications: prefs.getBool(PrefKeys.autoBackupNotifications) ?? true,
      rules: rules,
      lastBackupAt:
          lastAtMs == null ? null : DateTime.fromMillisecondsSinceEpoch(lastAtMs),
    );
    if (state.enabled) _scheduleTimer();
  }

  // ── Global toggle / conditions ───────────────────────────────────────────

  Future<void> setEnabled(bool value) async {
    state = state.copyWith(enabled: value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(PrefKeys.autoBackupEnabled, value);
    if (value) {
      _scheduleTimer();
      // Kick off an immediate scan so the user sees it working.
      unawaited(scanNow());
    } else {
      _cancelTimer();
    }
  }

  Future<void> setWifiOnly(bool value) async {
    state = state.copyWith(wifiOnly: value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(PrefKeys.autoBackupWifiOnly, value);
  }

  Future<void> setMobileDataAllowed(bool value) async {
    state = state.copyWith(mobileDataAllowed: value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(PrefKeys.autoBackupMobileData, value);
  }

  Future<void> setChargingOnly(bool value) async {
    state = state.copyWith(chargingOnly: value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(PrefKeys.autoBackupChargingOnly, value);
  }

  Future<void> setFrequency(BackupFrequency value) async {
    state = state.copyWith(frequency: value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(PrefKeys.autoBackupFrequency, value.index);
    if (state.enabled) _scheduleTimer();
  }

  Future<void> setNotifications(bool value) async {
    state = state.copyWith(notifications: value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(PrefKeys.autoBackupNotifications, value);
  }

  // ── Rule CRUD ────────────────────────────────────────────────────────────

  Future<BackupRule> addRule({
    required String folderPath,
    required String folderName,
    required String telegramFolderId,
    required String telegramFolderTitle,
    bool includeSubfolders = false,
  }) async {
    final rule = BackupRule(
      id: const Uuid().v4(),
      folderPath: folderPath,
      folderName: folderName.isEmpty ? _lastSegment(folderPath) : folderName,
      telegramFolderId: telegramFolderId,
      telegramFolderTitle: telegramFolderTitle,
      createdAt: DateTime.now(),
      enabled: true,
      includeSubfolders: includeSubfolders,
    );
    final next = [...state.rules, rule];
    state = state.copyWith(rules: next);
    await _persistRules();
    if (state.enabled) unawaited(scanNow());
    return rule;
  }

  Future<void> updateRule(BackupRule updated) async {
    final next = state.rules
        .map((r) => r.id == updated.id ? updated : r)
        .toList(growable: false);
    state = state.copyWith(rules: next);
    await _persistRules();
  }

  Future<void> toggleRule(String ruleId) async {
    await updateRule(
      state.rules
          .firstWhere((r) => r.id == ruleId)
          .copyWith(enabled: !(state.rules.firstWhere((r) => r.id == ruleId).enabled)),
    );
  }

  Future<void> deleteRule(String ruleId) async {
    final next = state.rules.where((r) => r.id != ruleId).toList(growable: false);
    state = state.copyWith(rules: next);
    await _persistRules();
  }

  Future<void> _persistRules() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      PrefKeys.autoBackupRules,
      state.rules.map((r) => r.encode()).toList(),
    );
  }

  // ── Scheduling ───────────────────────────────────────────────────────────

  void _scheduleTimer() {
    _cancelTimer();
    if (_disposed) return;
    final period = Duration(minutes: state.frequency.minutes);
    _timer = Timer.periodic(period, (_) => scanNow());
  }

  void _cancelTimer() {
    _timer?.cancel();
    _timer = null;
  }

  /// Called by the app shell when the user returns to the app, so newly added
  /// files are picked up promptly instead of waiting for the next tick.
  void onAppResumed() {
    if (state.enabled) unawaited(scanNow());
  }

  // ── The scan / upload pass ───────────────────────────────────────────────

  /// Runs one backup pass: lists every enabled rule's folder, dedupes against
  /// the seen-fingerprint registry, and uploads new files to each rule's
  /// Telegram destination through the existing upload system.
  Future<void> scanNow() async {
    if (_disposed) return;
    if (!state.enabled) return;
    if (_scanRunning) return;
    if (state.rules.where((r) => r.enabled).isEmpty) return;

    // Network/power preconditions. These gate the whole pass so we never
    // start an upload that the constraints forbid.
    if (!await _conditionsMet()) {
      return;
    }

    _scanRunning = true;
    state = state.copyWith(scanning: true, clearError: true);
    try {
      // Tidy up leftover finished backup tasks so the upload list stays small.
      _ref.read(uploadProvider.notifier).pruneBackupTasks();
      final prefs = await SharedPreferences.getInstance();
      final seen = (prefs.getStringList(PrefKeys.autoBackupSeen) ?? const [])
          .toSet();

      final pending = <_PendingFile>[];
      String? passError;

      for (final rule in state.rules.where((r) => r.enabled)) {
        final dir = Directory(rule.folderPath);
        if (!dir.existsSync()) {
          passError = '“${rule.folderName}” is no longer available on this '
              'device.';
          continue;
        }
        try {
          final entities = await dir
              .list(recursive: rule.includeSubfolders, followLinks: false)
              .toList();
          for (final entity in entities) {
            if (entity is! File) continue;
            final stat = await entity.stat();
            if (stat.type != FileSystemEntityType.file) continue;
            final name = entity.uri.pathSegments.last;
            if (name.startsWith('.')) continue; // skip hidden files
            final fingerprint =
                '${entity.path}|${stat.size}|${stat.modified.millisecondsSinceEpoch}';
            if (seen.contains(fingerprint)) continue;
            pending.add(_PendingFile(
              rule: rule,
              file: entity,
              fingerprint: fingerprint,
              modified: stat.modified,
            ));
          }
        } catch (e) {
          passError = 'Could not read “${rule.folderName}”. The folder may '
              'require additional access on this Android version.';
        }
      }

      // Newest first so the most recent captures/photos upload first.
      pending.sort((a, b) => b.modified.compareTo(a.modified));
      state = state.copyWith(pendingCount: pending.length);

      var uploaded = 0;
      var paused = false;
      for (final item in pending) {
        // Re-check conditions before each upload; the user may have left Wi-Fi
        // or unplugged mid-pass.
        if (!await _conditionsMet()) {
          paused = true;
          state = state.copyWith(
            pendingCount: pending.length - uploaded,
            lastError: 'Paused: waiting for Wi-Fi or power.',
          );
          break;
        }
        try {
          await _ref.read(uploadProvider.notifier).uploadViaBackup(
                localPath: item.file.path,
                fileName: item.file.uri.pathSegments.last,
                folderId: item.rule.telegramFolderId,
                notifications: state.notifications,
              );
          seen.add(item.fingerprint);
          uploaded++;
          // Persist dedupe state progressively so an interrupted pass still
          // records what completed — duplicate prevention survives restarts.
          await prefs.setStringList(
              PrefKeys.autoBackupSeen, seen.toList());
          state = state.copyWith(
            lastBackupAt: DateTime.now(),
            pendingCount: pending.length - uploaded,
          );
        } catch (e) {
          // A single failed file shouldn't abort the rest of the pass.
          passError = 'Some files failed to back up. They will retry next pass.';
        }
      }

      // Only finalize counts when the pass ran to completion. A paused pass
      // keeps the remaining pending count and its "Paused" message intact.
      if (!paused) {
        if (uploaded > 0) {
          await prefs.setInt(PrefKeys.autoBackupLastAt,
              DateTime.now().millisecondsSinceEpoch);
        }
        state = state.copyWith(
          pendingCount: 0,
          lastError: passError,
          clearError: passError == null,
        );
      } else if (uploaded > 0) {
        await prefs.setInt(PrefKeys.autoBackupLastAt,
            DateTime.now().millisecondsSinceEpoch);
      }
    } finally {
      _scanRunning = false;
      if (!_disposed) state = state.copyWith(scanning: false);
    }
  }

  /// Effective precondition check honouring Wi-Fi / mobile-data / charging.
  Future<bool> _conditionsMet() async {
    try {
      final onWifi = await NativeTelegramChannel.isOnWifi();
      final allowedOnMobile = !state.wifiOnly && state.mobileDataAllowed;
      final networkOk = onWifi || allowedOnMobile;
      if (!networkOk) return false;
      if (state.chargingOnly) {
        final charging = await NativeTelegramChannel.isCharging();
        if (!charging) return false;
      }
      return true;
    } catch (_) {
      // If we can't read connectivity, fall back to attempting the upload —
      // the upload itself will fail with a clear error if there's no network.
      return true;
    }
  }

  String _lastSegment(String path) {
    final clean = path.replaceAll(RegExp(r'/+$'), '');
    final i = clean.lastIndexOf('/');
    return i >= 0 ? clean.substring(i + 1) : clean;
  }

  /// Clears the dedupe registry so the next pass re-uploads everything in the
  /// watched folders. Used by the "Back up now" / repair flows.
  Future<void> resetSeen() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(PrefKeys.autoBackupSeen);
    state = state.copyWith(lastError: null);
    if (state.enabled) unawaited(scanNow());
  }

  @override
  void dispose() {
    _disposed = true;
    _cancelTimer();
    super.dispose();
  }
}

class _PendingFile {
  const _PendingFile({
    required this.rule,
    required this.file,
    required this.fingerprint,
    required this.modified,
  });
  final BackupRule rule;
  final File file;
  final String fingerprint;
  final DateTime modified;
}

final autoBackupProvider =
    StateNotifierProvider<AutoBackupNotifier, AutoBackupState>((ref) {
  return AutoBackupNotifier(ref);
});
