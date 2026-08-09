import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// State for the Auto Backup feature.
///
/// Users can select which folders should be backed up automatically.
/// The selection is persisted to SharedPreferences so it survives reinstalls
/// via backup/restore.
class AutoBackupState {
  final bool enabled;
  final Set<String> selectedFolderIds;
  final bool isLoading;

  const AutoBackupState({
    this.enabled = false,
    this.selectedFolderIds = const {},
    this.isLoading = false,
  });

  AutoBackupState copyWith({
    bool? enabled,
    Set<String>? selectedFolderIds,
    bool? isLoading,
  }) =>
      AutoBackupState(
        enabled: enabled ?? this.enabled,
        selectedFolderIds: selectedFolderIds ?? this.selectedFolderIds,
        isLoading: isLoading ?? this.isLoading,
      );
}

class AutoBackupNotifier extends StateNotifier<AutoBackupState> {
  AutoBackupNotifier() : super(const AutoBackupState(isLoading: true)) {
    _load();
  }

  static const _enabledKey = 'auto_backup_enabled';
  static const _foldersKey = 'auto_backup_folders';

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final enabled = prefs.getBool(_enabledKey) ?? false;
    final folders = prefs.getStringList(_foldersKey) ?? const [];
    state = AutoBackupState(
      enabled: enabled,
      selectedFolderIds: folders.toSet(),
      isLoading: false,
    );
  }

  Future<void> setEnabled(bool value) async {
    state = state.copyWith(enabled: value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_enabledKey, value);
  }

  Future<void> toggleFolder(String folderId) async {
    final next = Set<String>.from(state.selectedFolderIds);
    if (!next.add(folderId)) next.remove(folderId);
    state = state.copyWith(selectedFolderIds: next);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_foldersKey, next.toList());
  }

  Future<void> setFolders(Set<String> ids) async {
    state = state.copyWith(selectedFolderIds: ids);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_foldersKey, ids.toList());
  }

  Future<void> clearAll() async {
    state = const AutoBackupState(enabled: false, selectedFolderIds: {});
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_enabledKey);
    await prefs.remove(_foldersKey);
  }
}

final autoBackupProvider =
    StateNotifierProvider<AutoBackupNotifier, AutoBackupState>((ref) {
  return AutoBackupNotifier();
});
