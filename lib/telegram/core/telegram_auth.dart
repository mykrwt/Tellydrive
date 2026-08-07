import '../../features/auth/domain/entities/telegram_session.dart';

/// Result of requesting a login code.
class AuthCodeResult {
  const AuthCodeResult({
    required this.phoneCodeHash,
    required this.isCodeViaApp,
    this.timeoutSeconds,
  });

  /// Opaque hash that must be passed back when submitting the code.
  final String phoneCodeHash;

  /// Whether the code arrived via the Telegram app (as opposed to SMS/call).
  final bool isCodeViaApp;

  final int? timeoutSeconds;
}

/// Lightweight view of the authenticated user.
class TelegramUserInfo {
  const TelegramUserInfo({
    required this.userId,
    required this.firstName,
    this.lastName,
    this.username,
    this.phone,
  });

  final int userId;
  final String firstName;
  final String? lastName;
  final String? username;
  final String? phone;
}

/// The authentication half of the Telegram engine: phone → OTP → 2FA → session.
///
/// Implementations must never leak Telegram chat/contact data — this interface
/// only exposes the identity needed to drive the gallery.
abstract interface class TelegramAuth {
  /// Requests a login code for [phone]. Returns the code hash.
  Future<AuthCodeResult> sendCode(String phone);

  /// Submits the OTP. May throw [RpcException.isPasswordNeeded].
  Future<TelegramSession> signIn({
    required String phone,
    required String code,
    required String phoneCodeHash,
  });

  /// Completes login when the account has two-step verification.
  Future<TelegramSession> checkPassword(String password);

  /// Returns the identity of the currently authenticated user.
  Future<TelegramUserInfo> getMe();

  /// Logs out and invalidates the local session.
  Future<void> logOut();

  /// Restores a previously stored session from secure storage, or null.
  String? restoreSession();

  /// Persists the session so the user doesn't log in again.
  Future<void> storeSession(TelegramSession session);

  /// Clears the stored session (sign out).
  Future<void> clearSession();

  /// Whether a usable session is already stored.
  Future<bool> hasSession();
}
