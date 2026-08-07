import 'package:flutter/foundation.dart';

import '../../../core/error/app_exception.dart';
import '../domain/entities/telegram_session.dart';

/// FSM states for the sign-in flow.
@immutable
sealed class AuthState {
  const AuthState();
}

/// Still determining whether a stored session exists.
class AuthUnknown extends AuthState {
  const AuthUnknown();
}

/// Signed out — show the phone number screen.
class AuthSignedOut extends AuthState {
  const AuthSignedOut();
}

/// A code was requested; awaiting the OTP input.
class AuthCodeRequested extends AuthState {
  const AuthCodeRequested({
    required this.phone,
    required this.phoneCodeHash,
    required this.viaApp,
  });

  final String phone;
  final String phoneCodeHash;
  final bool viaApp;
}

/// A valid code was submitted; the account requires a two-step password.
class AuthNeedsPassword extends AuthState {
  const AuthNeedsPassword({
    required this.phone,
    required this.phoneCodeHash,
  });

  final String phone;
  final String phoneCodeHash;
}

/// Fully authenticated with a live session.
class AuthAuthenticated extends AuthState {
  const AuthAuthenticated(this.session);

  final TelegramSession session;
}

/// The previous step failed.
class AuthFailed extends AuthState {
  const AuthFailed(this.error);

  final AppException error;
}
