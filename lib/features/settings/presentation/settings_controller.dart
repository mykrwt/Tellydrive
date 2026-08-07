import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/storage/media_cache.dart';

/// Theme + cache controls.
class SettingsController extends Notifier<SettingsState> {
  @override
  SettingsState build() {
    return const SettingsState(darkMode: false);
  }

  void setDarkMode(bool value) => state = state.copyWith(darkMode: value);

  Future<void> clearCache() async {
    await MediaCache.instance.clear();
  }

  Future<void> clearLocalLibrary() async {
    await ref.read(libraryControllerProvider.notifier).reset();
  }
}

class SettingsState {
  const SettingsState({this.darkMode = false});

  final bool darkMode;

  SettingsState copyWith({bool? darkMode}) =>
      SettingsState(darkMode: darkMode ?? this.darkMode);
}

