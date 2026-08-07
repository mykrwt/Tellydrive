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
    } on Object catch (e) {
      state = AuthFailed(
        TelegramException('Could not restore your session.', cause: e),
      );
    }
  }

  Future<void> sendCode(String phone) async {
    try {
      final result = await _auth.sendCode(phone);
      state = AuthCodeRequested(
        phone: phone,
        phoneCodeHash: result.phoneCodeHash,
        viaApp: result.isCodeViaApp,
      );
    } on AppException catch (e) {
      state = AuthFailed(e);
    } on Object catch (e) {
      state = AuthFailed(TelegramException('Could not send the code.', cause: e));
    }
  }

  Future<void> submitCode(String code) async {
    final s = state;
    if (s is! AuthCodeRequested) return;
    try {
      final session = await _auth.signIn(
        phone: s.phone,
        code: code,
        phoneCodeHash: s.phoneCodeHash,
      );
      await _onAuthenticated(session);
    } on RpcException catch (e) {
      if (e.isPasswordNeeded) {
        state = AuthNeedsPassword(
          phone: s.phone,
          phoneCodeHash: s.phoneCodeHash,
        );
        return;
      }
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
    final authKey = _auth.restoreSession() ?? '';
    final transport = ref.read(transportProvider);
    await transport.connect(session: authKey.isEmpty ? null : authKey);
    final me = await _auth.getMe();
    final storage = MtprotoStorage(transport: transport, userId: me.userId);
    final core = TelegramCore(
      auth: _auth,
      storage: storage,
      transport: transport,
    );
    ref.read(telegramCoreProvider.notifier).state = core;
    state = AuthAuthenticated(
      TelegramSession(
        authKey: authKey,
        userId: me.userId,
        firstName: me.firstName,
        createdAt: DateTime.now(),
      ),
    );
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
}
