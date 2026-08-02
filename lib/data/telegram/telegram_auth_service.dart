import 'dart:async';
import 'dart:io';

import 'package:t/t.dart' as t;
import 'package:tg/tg.dart' as tg;

import '../../core/config/telegram_config.dart';
import 'mtproto_connection.dart';

/// Every possible state of the phone-number + OTP login flow, mirroring
/// exactly what the official Telegram apps walk a user through — TellyBase
/// never invents its own auth; it *is* a Telegram client.
enum TelegramAuthStep {
  enterPhoneNumber,
  enterOtpCode,
  enterTwoFactorPassword,
  authenticated,
}

class TelegramAuthException implements Exception {
  TelegramAuthException(this.message, {this.code});
  final String message;
  final String? code;
  @override
  String toString() => 'TelegramAuthException($code): $message';
}

/// Thin, app-facing wrapper around the pure-Dart MTProto client (`tg` +
/// `t`, via [MtprotoConnection]). Owns the login state machine:
///
///   1. `auth.sendCode`      -> Telegram texts/pushes a login code to the
///                              user's own Telegram app (or SMS as a
///                              fallback) — never through TellyBase.
///   2. `auth.signIn`        -> verify that code.
///   3. `auth.checkPassword` -> only if the account has Two-Step
///                              Verification (cloud password) enabled.
///
/// Once step 3 (or step 2, if no 2FA) succeeds, the resulting authorization
/// key *is* the user's session — the same kind of session file the desktop
/// or mobile Telegram app keeps — stored encrypted on-device only.
class TelegramAuthService {
  TelegramAuthService({required this.sessionDirectory})
      : _connection = MtprotoConnection(
          sessionFilePath: '${sessionDirectory.path}/mtproto_session.json',
        );

  final Directory sessionDirectory;
  final MtprotoConnection _connection;

  TelegramAuthStep _step = TelegramAuthStep.enterPhoneNumber;
  TelegramAuthStep get step => _step;

  String? _phoneNumber;
  t.AuthSentCode? _sentCode;
  t.AccountPassword? _pendingPassword;

  t.Client get client => _connection.client;

  /// Establishes the encrypted MTProto transport connection (Diffie-Hellman
  /// key exchange with Telegram's DC) — this happens before any user
  /// credentials are involved, exactly like the official client's cold
  /// start. If a session was already persisted from a previous login, this
  /// silently restores it (no OTP required again).
  Future<void> connect() async {
    await _connection.connect();

    if (await isAuthorized()) {
      _step = TelegramAuthStep.authenticated;
    }
  }

  Future<bool> isAuthorized() async {
    try {
      final result = await client.users.getFullUser(id: const t.InputUserSelf());
      return result.error == null && result.result != null;
    } catch (_) {
      return false;
    }
  }

  /// Step 1: user types their phone number (with country code, e.g.
  /// `+919876543210`). Telegram sends the OTP through its own channel.
  Future<void> sendLoginCode(String phoneNumberE164) async {
    _phoneNumber = phoneNumberE164;

    final response = await client.auth.sendCode(
      apiId: TelegramConfig.apiId,
      apiHash: TelegramConfig.apiHash,
      phoneNumber: phoneNumberE164,
      settings: const t.CodeSettings(
        allowFlashcall: false,
        currentNumber: true,
        allowAppHash: false,
        allowMissedCall: false,
        allowFirebase: false,
        unknownNumber: false,
      ),
    );

    final error = response.error;
    if (error != null) {
      // PHONE_MIGRATE_X: this phone's account actually lives on a
      // different data center; official clients silently reconnect there
      // and resend — TellyBase does the same instead of surfacing an
      // error to the user.
      if (error.errorMessage.startsWith('PHONE_MIGRATE_')) {
        final dcId = int.parse(error.errorMessage.split('_').last);
        await _connection.switchDataCenter(dcId);
        await _connection.connect();
        await sendLoginCode(phoneNumberE164);
        return;
      }
      throw TelegramAuthException(_friendlyError(error.errorMessage), code: error.errorMessage);
    }

    final sentCode = response.result;
    if (sentCode == null || sentCode is! t.AuthSentCode) {
      throw TelegramAuthException('Telegram did not return a usable login code response.');
    }
    _sentCode = sentCode;
    _step = TelegramAuthStep.enterOtpCode;
  }

  /// Step 2: user enters the code Telegram sent.
  Future<void> submitOtpCode(String code) async {
    final sentCode = _sentCode;
    if (sentCode == null) {
      throw StateError('Call sendLoginCode() before submitOtpCode().');
    }

    final response = await client.auth.signIn(
      phoneCodeHash: sentCode.phoneCodeHash,
      phoneNumber: _phoneNumber!,
      phoneCode: code,
    );

    if (response.error != null) {
      final err = response.error!.errorMessage;
      if (err == 'SESSION_PASSWORD_NEEDED') {
        final passwordResponse = await client.account.getPassword();
        final password = passwordResponse.result;
        if (password == null || password is! t.AccountPassword) {
          throw TelegramAuthException('Could not read Two-Step Verification settings.');
        }
        _pendingPassword = password;
        _step = TelegramAuthStep.enterTwoFactorPassword;
        return;
      }
      throw TelegramAuthException(_friendlyError(err), code: err);
    }

    _step = TelegramAuthStep.authenticated;
  }

  /// Step 3 (only if the user has Two-Step Verification enabled): their
  /// Telegram cloud password, hashed client-side using the SRP parameters
  /// Telegram supplies — the plaintext password itself never leaves the
  /// device, matching official client behaviour exactly.
  Future<void> submitTwoFactorPassword(String password) async {
    final accountPassword = _pendingPassword;
    if (accountPassword == null) {
      throw StateError('No pending 2FA challenge.');
    }

    final srpPassword = await tg.check2FA(accountPassword, password);
    final response = await client.auth.checkPassword(password: srpPassword);

    if (response.error != null) {
      throw TelegramAuthException(
        _friendlyError(response.error!.errorMessage),
        code: response.error!.errorMessage,
      );
    }

    _step = TelegramAuthStep.authenticated;
  }

  Future<void> logOut() async {
    await client.auth.logOut();
    await _connection.clearSession();
    _step = TelegramAuthStep.enterPhoneNumber;
    _sentCode = null;
    _pendingPassword = null;
  }

  String _friendlyError(String rawCode) {
    if (rawCode.startsWith('FLOOD_WAIT')) {
      return 'Too many attempts — Telegram is asking us to slow down. Try again shortly.';
    }
    return switch (rawCode) {
      'PHONE_NUMBER_INVALID' => 'That phone number doesn\'t look valid. Double-check the country code.',
      'PHONE_CODE_INVALID' => 'That code isn\'t right. Check the message from Telegram and try again.',
      'PHONE_CODE_EXPIRED' => 'That code expired. Request a new one.',
      'PASSWORD_HASH_INVALID' => 'Incorrect password.',
      _ => 'Something went wrong talking to Telegram ($rawCode).',
    };
  }
}
