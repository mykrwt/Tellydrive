import 'dart:async';

import '../../domain/repositories/auth_repository.dart';
import '../../../../services/platform/native_telegram_channel.dart';
import '../../../../services/storage/secure_storage_service.dart';
import '../../../../core/constants/app_constants.dart';

/// Real Telegram authentication via TDLib through the native Kotlin bridge.
///
/// Telegram api_id and api_hash are stored on the Android native side.
/// Flutter only sends the user's phone number, login code, and 2FA password.
///
/// Auth flow driven by TDLib auth state stream:
///   authorizationStateWaitPhoneNumber → ready for phone
///   authorizationStateWaitCode        → code sent to Telegram app
///   authorizationStateWaitPassword    → 2FA password required
///   authorizationStateReady           → logged in
class AuthRepositoryImpl implements AuthRepository {
  final SecureStorageService _storage;

  StreamSubscription<Map<String, dynamic>>? _sub;

  AuthRepositoryImpl(this._storage);

  // ---------- AuthRepository interface ----------

  @override
  Future<bool> hasSession() async {
    final isLoggedIn = await _storage.read(StorageKeys.isLoggedIn);
    final phone = await _storage.read(StorageKeys.phone);

    return isLoggedIn == 'true' && phone != null && phone.isNotEmpty;
  }

  @override
  Future<void> sendCode({
    required String phone,
  }) async {
    final cleanPhone = phone.trim();

    if (cleanPhone.isEmpty) {
      throw ArgumentError('Phone number cannot be empty.');
    }

    await _storage.write(StorageKeys.phone, cleanPhone);

    // Retry wrapper for transient network/TDLib hiccups — short timeouts
    // with exponential backoff keep the UX snappy.
    await _withRetry(
      () => _sendCodeAttempt(cleanPhone),
      retries: 2,
      baseTimeout: const Duration(seconds: 18),
    );
  }

  Future<void> _sendCodeAttempt(String cleanPhone) async {
    _subscribeToAuthStream();

    // Arm the future BEFORE initialize() so we never miss the first event.
    final waitForPhone = _waitForState(
      'authorizationStateWaitPhoneNumber',
      timeout: 15,
    );

    await _withTimeout(
      NativeTelegramChannel.initialize(),
      const Duration(seconds: 12),
    );

    await waitForPhone.timeout(
      const Duration(seconds: 15),
      onTimeout: () => throw TimeoutException('TDLib init timed out'),
    );

    await _withTimeout(
      NativeTelegramChannel.sendPhoneNumber(cleanPhone),
      const Duration(seconds: 12),
    );

    await _waitForState('authorizationStateWaitCode', timeout: 15);
  }

  @override
  Future<bool> verifyCode(String code) async {
    final cleanCode = code.trim();

    if (cleanCode.isEmpty) {
      throw ArgumentError('Login code cannot be empty.');
    }

    return _withRetry(
      () => _verifyCodeAttempt(cleanCode),
      retries: 1,
      baseTimeout: const Duration(seconds: 18),
    );
  }

  Future<bool> _verifyCodeAttempt(String cleanCode) async {
    await _withTimeout(
      NativeTelegramChannel.checkCode(cleanCode),
      const Duration(seconds: 12),
    );

    final state = await _waitForAnyOf([
      'authorizationStateReady',
      'authorizationStateWaitPassword',
    ], timeout: 15);

    if (state == 'authorizationStateReady') {
      await _onAuthenticated();
      return true;
    }
    return false;
  }

  @override
  Future<bool> verifyPassword(String password) async {
    if (password.isEmpty) {
      throw ArgumentError('Password cannot be empty.');
    }
    return _withRetry(
      () => _verifyPasswordAttempt(password),
      retries: 1,
      baseTimeout: const Duration(seconds: 18),
    );
  }

  Future<bool> _verifyPasswordAttempt(String password) async {
    await _withTimeout(
      NativeTelegramChannel.checkPassword(password),
      const Duration(seconds: 12),
    );

    final state = await _waitForState(
      'authorizationStateReady',
      timeout: 15,
    );

    if (state == 'authorizationStateReady') {
      await _onAuthenticated();
      return true;
    }
    return false;
  }

  @override
  Future<void> logout() async {
    await _sub?.cancel();
    _sub = null;

    await NativeTelegramChannel.logout();

    // This deletes app-side stored values such as phone/isLoggedIn.
    // TDLib logout should clear Telegram session on the native side.
    await _storage.deleteAll();
  }

  @override
  Future<bool> restoreSession() async {
    // Subscribe first, then arm future, then initialize — same ordering fix
    // as sendCode() to avoid missing the very first TDLib auth state event.
    _subscribeToAuthStream();

    final waitForState = _waitForAnyOf([
      'authorizationStateReady',
      'authorizationStateWaitPhoneNumber',
      'authorizationStateWaitCode',
      'authorizationStateWaitPassword',
    ], timeout: 20);

    // Initialize TDLib using native BuildConfig credentials.
    // If a valid TDLib session exists on disk, TDLib should move to Ready.
    await NativeTelegramChannel.initialize();

    try {
      final state = await waitForState;

      final isReady = state == 'authorizationStateReady';

      if (isReady) {
        await _storage.write(StorageKeys.isLoggedIn, 'true');
      } else {
        await _storage.write(StorageKeys.isLoggedIn, 'false');
      }

      return isReady;
    } catch (_) {
      await _storage.write(StorageKeys.isLoggedIn, 'false');
      return false;
    }
  }

  // ---------- Private helpers & resilience ----------

  Future<T> _withTimeout<T>(Future<T> future, Duration timeout) {
    return future.timeout(
      timeout,
      onTimeout: () => throw TimeoutException('Operation timed out after ${timeout.inSeconds}s'),
    );
  }

  Future<T> _withRetry<T>(
    Future<T> Function() action, {
    int retries = 2,
    Duration baseTimeout = const Duration(seconds: 18),
  }) async {
    var attempt = 0;
    while (true) {
      try {
        return await action().timeout(baseTimeout + Duration(seconds: attempt * 3));
      } catch (e) {
        final isRetriable = e is TimeoutException ||
            e.toString().contains('timed out') ||
            e.toString().contains('TimeoutException') ||
            e.toString().contains('Network is unreachable') ||
            e.toString().contains('Connection') ||
            e.toString().contains('Failed host lookup');
        if (!isRetriable || attempt >= retries) rethrow;
        final backoff = Duration(milliseconds: 600 * (1 << attempt));
        await Future<void>.delayed(backoff);
        attempt++;
      }
    }
  }

  void _subscribeToAuthStream() {
    _sub?.cancel();

    _sub = NativeTelegramChannel.authStateStream.listen(
      (event) {
        // Keeps the broadcast stream active; per-call waiters handle state.
      },
      onError: (_) {},
    );
  }

  Future<String> _waitForState(
    String expectedState, {
    required int timeout,
  }) async {
    return _waitForAnyOf([expectedState], timeout: timeout);
  }

  Future<String> _waitForAnyOf(
    List<String> states, {
    required int timeout,
  }) async {
    final completer = Completer<String>();
    late StreamSubscription<Map<String, dynamic>> sub;

    sub = NativeTelegramChannel.authStateStream.listen(
      (event) {
        if (event['type'] == 'authState') {
          final state = event['state'] as String? ?? '';
          if (states.contains(state) && !completer.isCompleted) {
            completer.complete(state);
            sub.cancel();
          }
        } else if (event['type'] == 'error' && !completer.isCompleted) {
          final message = event['message'] as String? ?? 'Unknown Telegram error';
          completer.completeError(Exception(message));
          sub.cancel();
        }
      },
      onError: (error) {
        if (!completer.isCompleted) {
          completer.completeError(error);
          sub.cancel();
        }
      },
    );

    // Ensure subscription is cancelled on timeout as well.
    try {
      return await completer.future.timeout(
        Duration(seconds: timeout),
        onTimeout: () {
          sub.cancel();
          throw TimeoutException('Telegram auth timed out waiting for: $states');
        },
      );
    } catch (e) {
      await sub.cancel();
      rethrow;
    }
  }

  Future<void> _onAuthenticated() async {
    await _storage.write(StorageKeys.isLoggedIn, 'true');
    await _sub?.cancel();
    _sub = null;
  }
}
