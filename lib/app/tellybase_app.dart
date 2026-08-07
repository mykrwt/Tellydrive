import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/di/providers.dart';
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
      AuthFailed(error: final e) => SignInScreen(initialError: e.message),
      AuthCodeRequested() => const OtpScreen(),
      AuthNeedsPassword() => const TwoFactorScreen(),
      AuthAuthenticated() => const HomeShell(),
      _ => const SignInScreen(), // exhaustive fallback
    };
  }
}
