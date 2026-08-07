import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/di/providers.dart';
import 'backup_preferences.dart';
import 'backup_service.dart';

/// Backup settings + the single in-app backup run button.
class BackupController extends Notifier<BackupState> {
  BackupService get _service => BackupService(ref);

  @override
  BackupState build() {
    _hydrate();
    return const BackupState();
  }

  Future<void> _hydrate() async {
    final prefs = await _prefs();
    state = BackupState(
      enabled: prefs.enabled,
      wifiOnly: prefs.wifiOnly,
    );
  }

  Future<BackupPreferences> _prefs() async {
    final sp = await ref.read(preferencesProvider.future);
    return BackupPreferences(sp);
  }

  Future<void> setEnabled(bool value) async {
    final prefs = await _prefs();
    await prefs.setEnabled(value);
    state = state.copyWith(enabled: value);
  }

  Future<void> setWifiOnly(bool value) async {
    final prefs = await _prefs();
    await prefs.setWifiOnly(value);
    state = state.copyWith(wifiOnly: value);
  }

  /// Runs one backup pass. Returns the number of newly backed-up items.
  Future<int> runNow() async {
    state = state.copyWith(isRunning: true, error: null);
    try {
      final count = await _service.backupOnce();
      state = state.copyWith(isRunning: false, lastBackupCount: count);
      return count;
    } on Object catch (e) {
      state = state.copyWith(isRunning: false, error: e.toString());
      return 0;
    }
  }
}

class BackupState {
  const BackupState({
    this.enabled = false,
    this.wifiOnly = true,
    this.isRunning = false,
    this.lastBackupCount,
    this.error,
  });

  final bool enabled;
  final bool wifiOnly;
  final bool isRunning;
  final int? lastBackupCount;
  final String? error;

  BackupState copyWith({
    bool? enabled,
    bool? wifiOnly,
    bool? isRunning,
    int? lastBackupCount,
    String? error,
  }) =>
      BackupState(
        enabled: enabled ?? this.enabled,
        wifiOnly: wifiOnly ?? this.wifiOnly,
        isRunning: isRunning ?? this.isRunning,
        lastBackupCount: lastBackupCount ?? this.lastBackupCount,
        error: error ?? this.error,
      );
}

