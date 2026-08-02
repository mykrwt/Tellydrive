import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/telegram/telegram_auth_service.dart';
import '../data/telegram/telegram_vault_service.dart';
import 'app_providers.dart';

enum AuthUiState { checking, needsPhone, needsOtp, needsPassword, ready, error }

class AuthState {
  const AuthState({
    required this.uiState,
    this.errorMessage,
    this.phoneNumber,
    this.isBusy = false,
  });

  final AuthUiState uiState;
  final String? errorMessage;
  final String? phoneNumber;
  final bool isBusy;

  AuthState copyWith({
    AuthUiState? uiState,
    String? errorMessage,
    String? phoneNumber,
    bool? isBusy,
  }) =>
      AuthState(
        uiState: uiState ?? this.uiState,
        errorMessage: errorMessage,
        phoneNumber: phoneNumber ?? this.phoneNumber,
        isBusy: isBusy ?? this.isBusy,
      );
}

/// Drives the onboarding screen through Telegram's own phone+OTP (+
/// optional 2FA) login flow. Every method here maps 1:1 onto a real
/// MTProto call executed against Telegram's servers via
/// [TelegramAuthService] — there is no TellyBase-side account system to
/// stand in for it.
class AuthController extends StateNotifier<AuthState> {
  AuthController(this._auth, this._vault)
      : super(const AuthState(uiState: AuthUiState.checking)) {
    _bootstrap();
  }

  final TelegramAuthService _auth;
  final TelegramVaultService _vault;

  Future<void> _bootstrap() async {
    try {
      await _auth.connect();
      if (_auth.step == TelegramAuthStep.authenticated) {
        await _vault.ensureVaultExists();
        state = state.copyWith(uiState: AuthUiState.ready);
      } else {
        state = state.copyWith(uiState: AuthUiState.needsPhone);
      }
    } catch (e) {
      state = state.copyWith(uiState: AuthUiState.error, errorMessage: e.toString());
    }
  }

  Future<void> submitPhoneNumber(String phoneNumberE164) async {
    state = state.copyWith(isBusy: true, errorMessage: null);
    try {
      await _auth.sendLoginCode(phoneNumberE164);
      state = state.copyWith(
        uiState: AuthUiState.needsOtp,
        phoneNumber: phoneNumberE164,
        isBusy: false,
      );
    } on TelegramAuthException catch (e) {
      state = state.copyWith(isBusy: false, errorMessage: e.message);
    } catch (e) {
      state = state.copyWith(isBusy: false, errorMessage: 'Unexpected error: $e');
    }
  }

  Future<void> submitOtp(String code) async {
    state = state.copyWith(isBusy: true, errorMessage: null);
    try {
      await _auth.submitOtpCode(code);
      if (_auth.step == TelegramAuthStep.enterTwoFactorPassword) {
        state = state.copyWith(uiState: AuthUiState.needsPassword, isBusy: false);
        return;
      }
      await _vault.ensureVaultExists();
      state = state.copyWith(uiState: AuthUiState.ready, isBusy: false);
    } on TelegramAuthException catch (e) {
      state = state.copyWith(isBusy: false, errorMessage: e.message);
    } catch (e) {
      state = state.copyWith(isBusy: false, errorMessage: 'Unexpected error: $e');
    }
  }

  Future<void> submitPassword(String password) async {
    state = state.copyWith(isBusy: true, errorMessage: null);
    try {
      await _auth.submitTwoFactorPassword(password);
      await _vault.ensureVaultExists();
      state = state.copyWith(uiState: AuthUiState.ready, isBusy: false);
    } on TelegramAuthException catch (e) {
      state = state.copyWith(isBusy: false, errorMessage: e.message);
    } catch (e) {
      state = state.copyWith(isBusy: false, errorMessage: 'Unexpected error: $e');
    }
  }

  Future<void> resendCode() async {
    final phone = state.phoneNumber;
    if (phone == null) return;
    await submitPhoneNumber(phone);
  }

  Future<void> signOut() async {
    await _auth.logOut();
    state = const AuthState(uiState: AuthUiState.needsPhone);
  }
}

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>((ref) {
  final auth = ref.watch(telegramAuthServiceProvider);
  final vault = ref.watch(telegramVaultServiceProvider);
  return AuthController(auth, vault);
});
