import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/app_exception.dart';
import '../../../telegram/core/telegram_auth.dart';
import '../../../telegram/core/telegram_core.dart';
import '../../../telegram/mtproto/mtproto_storage.dart';
import '../domain/entities/telegram_session.dart';
import 'auth_state.dart';

/// Drives the phone → OTP → 2FA → authenticated flow and, once authenticated,
/// assembles the [TelegramCore] (auth + storage) that the rest of the app uses.
class AuthController extends Notifier<AuthState> {
  TelegramAuth get _auth => ref.read(telegramAuthProvider);

  // Keep last code request so OTP errors can stay on OTP screen.
  String? _lastPhone;
  String? _lastPhoneCodeHash;
  bool _lastViaApp = false;

  @override
  AuthState build() {
    _restore();
    return const AuthUnknown();
  }

  Future<void> _restore() async {
    try {
      final has = await _auth.hasSession();
      if (!has) {
        state = const AuthSignedOut();
        return;
      }
      await _activateSession();
    } on AppException catch (e) {
      state = AuthFailed(e);
    } on Object catch (e) {
      state = AuthFailed(
        TelegramException('Could not restore your session.', cause: e),
      );
    }
  }

  Future<void> sendCode(String phone) async {
    // Normalize: ensure E.164 format with leading +
    final normalized = _normalizePhone(phone);
    try {
      // Transport's _ensureConnected will auto-connect anonymously for first login
      final result = await _auth.sendCode(normalized);
      _lastPhone = normalized;
      _lastPhoneCodeHash = result.phoneCodeHash;
      _lastViaApp = result.isCodeViaApp;
      state = AuthCodeRequested(
        phone: normalized,
        phoneCodeHash: result.phoneCodeHash,
        viaApp: result.isCodeViaApp,
      );
    } on AppException catch (e) {
      state = AuthFailed(e);
    } on Object catch (e) {
      state =
          AuthFailed(TelegramException('Could not send the code.', cause: e));
    }
  }

  Future<void> submitCode(String code) async {
    // Allow submitting from AuthCodeRequested OR after a failed code attempt
    // (AuthFailed with code error) – we keep last phone/hash.
    String? phone = _lastPhone;
    String? hash = _lastPhoneCodeHash;
    final s = state;
    if (s is AuthCodeRequested) {
      phone = s.phone;
      hash = s.phoneCodeHash;
    }
    if (phone == null || hash == null) return;

    try {
      final session = await _auth.signIn(
        phone: phone,
        code: code.trim(),
        phoneCodeHash: hash,
      );
      await _onAuthenticated(session);
    } on RpcException catch (e) {
      if (e.isPasswordNeeded) {
        state = AuthNeedsPassword(
          phone: phone,
          phoneCodeHash: hash,
        );
        return;
      }
      // Keep last request info so RootGate can stay on OTP screen
      state = AuthFailed(e);
    } on AppException catch (e) {
      state = AuthFailed(e);
    } on Object catch (e) {
      state = AuthFailed(TelegramException('Sign-in failed.', cause: e));
    }
  }

  Future<void> submitPassword(String password) async {
    try {
      final session = await _auth.checkPassword(password);
      await _onAuthenticated(session);
    } on AppException catch (e) {
      state = AuthFailed(e);
    } on Object catch (e) {
      state = AuthFailed(
        TelegramException('Could not verify the password.', cause: e),
      );
    }
  }

  Future<void> signOut() async {
    try {
      await _auth.logOut();
    } on Object {
      // continue clearing local state regardless
    }
    _lastPhone = null;
    _lastPhoneCodeHash = null;
    ref.read(telegramCoreProvider.notifier).state = null;
    try {
      await ref.read(libraryControllerProvider.notifier).reset();
    } on Object {
      // library may not have been initialised — that's fine on sign-out.
    }
    state = const AuthSignedOut();
  }

  /// Rebuilds the engine from the session persisted in secure storage.
  Future<void> _activateSession() async {
    try {
      final sessionStorage = ref.read(sessionStorageProvider);
      final transport = ref.read(transportProvider);

      // Read the persisted session directly – this is the source of truth.
      final stored = await sessionStorage.read();

      if (stored == null || stored.isEmpty) {
        state = const AuthSignedOut();
        return;
      }

      // Connect using the stored session. This will throw if session expired.
      await transport.connect(session: stored);

      final me = await _auth.getMe();

      // Re-export to get canonical representation and refresh storage.
      final freshExport = _auth.restoreSession();
      final effectiveKey = freshExport?.isNotEmpty == true ? freshExport! : stored;

      final storage = MtprotoStorage(transport: transport, userId: me.userId);
      final core = TelegramCore(
        auth: _auth,
        storage: storage,
        transport: transport,
      );
      ref.read(telegramCoreProvider.notifier).state = core;
      state = AuthAuthenticated(
        TelegramSession(
          authKey: effectiveKey,
          userId: me.userId,
          firstName: me.firstName,
          createdAt: DateTime.now(),
        ),
      );
    } on TelegramConfigurationException catch (e) {
      // The secure session may still be valid. Keep it so a build repaired
      // with the correct credentials can restore without another OTP.
      state = AuthFailed(e);
    } on AppException {
      // Session invalid/expired – clear and go to signed out.
      try {
        await ref.read(sessionStorageProvider).clear();
      } catch (_) {}
      state = const AuthSignedOut();
    } on Object catch (e) {
      // Network failure during restore – show failed but allow retry via sign-in?
      // Treat as signed out with error.
      state = AuthFailed(
        TelegramException('Could not restore your session.', cause: e),
      );
    }
  }

  Future<void> _onAuthenticated(TelegramSession session) async {
    final transport = ref.read(transportProvider);
    final storage = MtprotoStorage(
      transport: transport,
      userId: session.userId,
    );
    final core = TelegramCore(
      auth: _auth,
      storage: storage,
      transport: transport,
    );
    ref.read(telegramCoreProvider.notifier).state = core;
    state = AuthAuthenticated(session);
  }

  // Helpers
  String _normalizePhone(String input) {
    var s = input.trim();
    // Remove spaces, dashes, parentheses, etc., keep leading +
    s = s.replaceAll(RegExp(r'[^\d+]'), '');
    // Ensure only one leading +
    if (s.startsWith('+')) {
      s = '+${s.substring(1).replaceAll('+', '')}';
    } else {
      // If no +, keep as is – caller (UI) should have added country code,
      // but we defensively add + if it looks like international number
      if (s.isNotEmpty && !s.startsWith('+')) {
        // If UI already combined country code, it's numeric; add +
        s = '+$s';
      }
    }
    // Strip leading zeros after country code? Keep for now – Telegram accepts.
    return s;
  }

  // Expose for UI
  String? get lastPhone => _lastPhone;
}
