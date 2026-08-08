import '../../core/error/app_exception.dart';
import '../../core/storage/session_storage.dart';
import '../../features/auth/domain/entities/telegram_session.dart';
import '../core/telegram_auth.dart';
import 'mtproto_transport.dart';

/// [TelegramAuth] built on [MtprotoTransport].
class MtprotoAuth implements TelegramAuth {
  MtprotoAuth({
    required MtprotoTransport transport,
    required SessionStorage sessionStorage,
  })  : _transport = transport,
        _sessionStorage = sessionStorage;

  final MtprotoTransport _transport;
  final SessionStorage _sessionStorage;

  @override
  Future<AuthCodeResult> sendCode(String phone) async {
    try {
      final r = await _transport.sendCode(phone);
      return AuthCodeResult(
        phoneCodeHash: r.hash,
        isCodeViaApp: r.viaApp,
        timeoutSeconds: r.timeout,
      );
    } on RpcException {
      rethrow;
    } on TelegramException {
      rethrow;
    } on Object catch (e) {
      throw TelegramException('Could not request the login code.', cause: e);
    }
  }

  @override
  Future<TelegramSession> signIn({
    required String phone,
    required String code,
    required String phoneCodeHash,
  }) async {
    try {
      await _transport.signIn(
        phone: phone,
        code: code,
        hash: phoneCodeHash,
      );
    } on RpcException catch (e) {
      if (e.isPasswordNeeded) {
        // Caller should route to the 2FA screen.
        rethrow;
      }
      rethrow;
    } on TelegramException {
      rethrow;
    }
    return _buildSession(phone: phone);
  }

  @override
  Future<TelegramSession> checkPassword(String password) async {
    try {
      await _transport.checkPassword(password);
    } on RpcException {
      rethrow;
    }
    return _buildSession();
  }

  @override
  Future<TelegramUserInfo> getMe() async {
    try {
      final userId = await _transport.getMe();
      final firstName = await _transport.getFirstName();
      return TelegramUserInfo(userId: userId, firstName: firstName);
    } on TelegramException {
      rethrow;
    } on Object catch (e) {
      throw TelegramException('Could not fetch user info.', cause: e);
    }
  }

  @override
  Future<void> logOut() async {
    try {
      await _transport.logOut();
    } catch (_) {
      // ignore network errors, still clear local
    }
    await clearSession();
  }

  @override
  String? restoreSession() => _transport.exportSession();

  @override
  Future<void> storeSession(TelegramSession session) async {
    // If transport already has this key, don't reconnect unnecessarily
    final current = _transport.exportSession();
    if (current != session.authKey) {
      await _transport.connect(session: session.authKey);
    }
    await _sessionStorage.write(session.authKey);
  }

  @override
  Future<void> clearSession() => _sessionStorage.clear();

  @override
  Future<bool> hasSession() async {
    final value = await _sessionStorage.read();
    return value != null && value.isNotEmpty;
  }

  /// Reconnects using a stored session, if present.
  Future<void> connectStoredSession() async {
    final stored = await _sessionStorage.read();
    if (stored == null || stored.isEmpty) return;
    await _transport.connect(session: stored);
  }

  Future<TelegramSession> _buildSession({String? phone}) async {
    final userId = await _transport.getMe();
    final firstName = await _transport.getFirstName();
    final authKey = _transport.exportSession();
    if (authKey.isEmpty) {
      throw const TelegramException(
          'Authentication did not produce a session. Try again.');
    }
    final session = TelegramSession(
      authKey: authKey,
      userId: userId,
      firstName: firstName,
      phone: phone,
      createdAt: DateTime.now(),
    );
    await _sessionStorage.write(authKey);
    return session;
  }
}
