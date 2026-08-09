import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/constants/app_constants.dart';

/// Biometric app lock. When enabled in Settings, the Home shell requires a
/// successful biometric/device authentication before revealing content, and
/// re-locks when the app returns from the background.
class AppLockService {
  AppLockService._();
  static final AppLockService instance = AppLockService._();

  final LocalAuthentication _auth = LocalAuthentication();

  Future<bool> isEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(PrefKeys.appLockEnabled) ?? false;
  }

  Future<void> setEnabled(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(PrefKeys.appLockEnabled, value);
  }

  /// True when the device can authenticate the user (biometrics or device
  /// credential). Used to decide whether the toggle may be turned on.
  Future<bool> isAvailable() async {
    try {
      final canCheck = await _auth.canCheckBiometrics;
      final deviceSupported = await _auth.isDeviceSupported();
      return canCheck || deviceSupported;
    } catch (_) {
      return false;
    }
  }

  /// Runs the platform authentication prompt. Returns true on success. Uses
  /// the minimal cross-version signature (defaults allow device credential
  /// fallback, which is what we want for an app lock).
  Future<bool> authenticate({String reason = 'Unlock TeleDrive'}) async {
    try {
      return await _auth.authenticate(localizedReason: reason);
    } catch (_) {
      return false;
    }
  }
}
