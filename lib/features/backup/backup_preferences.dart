import 'package:shared_preferences/shared_preferences.dart';

/// Non-sensitive backup settings + the set of device asset ids already
/// uploaded for the current account (so re-scans don't re-upload).
class BackupPreferences {
  BackupPreferences(this._prefs);

  final SharedPreferences _prefs;

  static const String _enabledKey = 'backup.enabled';
  static const String _wifiOnlyKey = 'backup.wifi_only';
  static const String _uploadsPrefix = 'backup.uploaded.';

  bool get enabled => _prefs.getBool(_enabledKey) ?? false;
  Future<void> setEnabled(bool value) => _prefs.setBool(_enabledKey, value);

  bool get wifiOnly => _prefs.getBool(_wifiOnlyKey) ?? true;
  Future<void> setWifiOnly(bool value) => _prefs.setBool(_wifiOnlyKey, value);

  Set<String> uploadedAssetIds(int userId) =>
      (_prefs.getStringList('$_uploadsPrefix$userId') ?? const []).toSet();

  Future<void> markUploaded(int userId, String assetId) async {
    final key = '$_uploadsPrefix$userId';
    final set = uploadedAssetIds(userId)..add(assetId);
    await _prefs.setStringList(key, set.toList());
  }

  Future<void> clearUploaded(int userId) => _prefs.remove('$_uploadsPrefix$userId');
}
