import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/di/providers.dart';
import '../core/error/app_exception.dart';
import '../features/auth/presentation/auth_state.dart';
import '../features/auth/presentation/screens/otp_screen.dart';
import '../features/auth/presentation/screens/sign_in_screen.dart';
import '../features/auth/presentation/screens/splash_screen.dart';
import '../features/auth/presentation/screens/two_factor_screen.dart';
import '../features/settings/presentation/settings_controller.dart';
import 'theme/app_theme.dart';
import 'widgets/home_shell.dart';

/// Material 3 application root.
class TellybaseApp extends ConsumerWidget {
  const TellybaseApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final darkMode = ref.watch(settingsControllerProvider).darkMode;
    return MaterialApp(
      title: 'TellyBase',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: darkMode ? ThemeMode.dark : ThemeMode.light,
      home: const RootGate(),
    );
  }
}

/// Switches the top-level screen based on the authentication state.
class RootGate extends ConsumerWidget {
  const RootGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    return switch (auth) {
      AuthUnknown() => const SplashScreen(),
      AuthSignedOut() => const SignInScreen(),
      AuthCodeRequested() => const OtpScreen(),
      AuthNeedsPassword() => const TwoFactorScreen(),
      AuthAuthenticated() => const HomeShell(),
      AuthFailed(:final error) => _screenForFailure(error),
    };
  }

  Widget _screenForFailure(AppException error) {
    if (error is RpcException) {
      // OTP errors should stay on OTP screen
      if (error.code.contains('PHONE_CODE') ||
          error.code == 'PHONE_NUMBER_INVALID') {
        return const OtpScreen();
      }
      // Password errors stay on 2FA screen
      if (error.isPasswordInvalid ||
          error.code.contains('PASSWORD') ||
          error.code == 'SRP_ID_INVALID') {
        return const TwoFactorScreen();
      }
      // SESSION_PASSWORD_NEEDED is handled separately, but just in case
      if (error.isPasswordNeeded) {
        return const TwoFactorScreen();
      }
    }
    // Default to sign-in for phone/network errors
    return const SignInScreen();
  }
}
