import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/app_theme.dart';
import 'data/telegram/telegram_auth_service.dart';
import 'presentation/screens/home/root_shell.dart';
import 'presentation/screens/onboarding/onboarding_flow.dart';
import 'services/background/background_scheduler.dart';
import 'state/app_providers.dart';
import 'state/auth_controller.dart';
import 'state/theme_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final sessionDir = await resolveSessionDirectory();
  await BackgroundScheduler.initialize();

  runApp(
    ProviderScope(
      overrides: [
        telegramAuthServiceProvider.overrideWithValue(
          TelegramAuthService(sessionDirectory: sessionDir),
        ),
      ],
      child: const TellyBaseApp(),
    ),
  );
}

class TellyBaseApp extends ConsumerWidget {
  const TellyBaseApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp(
      title: 'TellyBase',
      debugShowCheckedModeBanner: false,
      themeMode: themeMode,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      home: const _AppGate(),
    );
  }
}

/// Routes between the onboarding (phone/OTP/2FA) flow and the main app
/// shell based on Telegram authentication state — TellyBase has no
/// concept of "logged in" that is separate from "has an active Telegram
/// MTProto session".
class _AppGate extends ConsumerWidget {
  const _AppGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);

    return AnimatedSwitcher(
      duration: AppMotion.medium,
      switchInCurve: AppMotion.springCurve,
      child: switch (auth.uiState) {
        AuthUiState.checking => const _SplashScreen(key: ValueKey('splash')),
        AuthUiState.ready => const RootShell(key: ValueKey('root')),
        _ => const OnboardingFlow(key: ValueKey('onboarding')),
      },
    );
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(22),
                gradient: const LinearGradient(
                  colors: [AppColors.systemBlue, AppColors.systemPurple],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: const Icon(Icons.cloud_outlined, color: Colors.white, size: 44),
            ),
            const SizedBox(height: 20),
            Text('TellyBase', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 24),
            const CircularProgressIndicator.adaptive(),
          ],
        ),
      ),
    );
  }
}
