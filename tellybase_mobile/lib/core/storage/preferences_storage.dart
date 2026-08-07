import 'package:shared_preferences/shared_preferences.dart';

abstract interface class PreferencesStorage {
  bool get galleryUsesGrid;
  bool get filesUseGrid;
  Future<void> setFilesUseGrid({required bool value});
  Future<void> setGalleryUsesGrid({required bool value});
}

class SharedPreferencesStorage implements PreferencesStorage {
  const SharedPreferencesStorage(this._preferences);

  static const _galleryGrid = 'gallery.grid.v1';
  static const _filesGrid = 'files.grid.v1';
  final SharedPreferences _preferences;

  @override
  bool get galleryUsesGrid => _preferences.getBool(_galleryGrid) ?? true;

  @override
  bool get filesUseGrid => _preferences.getBool(_filesGrid) ?? false;

  @override
  Future<void> setFilesUseGrid({required bool value}) =>
      _preferences.setBool(_filesGrid, value);

  @override
  Future<void> setGalleryUsesGrid({required bool value}) =>
      _preferences.setBool(_galleryGrid, value);
}
