import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tellybase_mobile/app/theme/app_theme.dart';
import 'package:tellybase_mobile/core/config/app_config.dart';
import 'package:tellybase_mobile/core/widgets/app_logo.dart';
import 'package:tellybase_mobile/features/auth/presentation/controllers/auth_controller.dart';
import 'package:tellybase_mobile/features/auth/presentation/screens/sign_in_screen.dart';
import 'package:tellybase_mobile/features/auth/presentation/screens/splash_screen.dart';
import 'package:tellybase_mobile/features/shell/presentation/screens/main_shell.dart';

class TellyBaseApp extends StatelessWidget {
  const TellyBaseApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.dark,
      home: const _AuthGate(),
    );
  }
}

class _AuthGate extends ConsumerWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    return auth.when(
      loading: () => const SplashScreen(),
      data: (user) => user == null ? const SignInScreen() : const MainShell(),
      error: (error, _) => Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(30),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const AppLogo(),
                  const SizedBox(height: 34),
                  Icon(Icons.cloud_off_rounded, size: 52, color: Theme.of(context).colorScheme.error),
                  const SizedBox(height: 18),
                  Text('Could not verify your session', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 9),
                  Text(error.toString(), textAlign: TextAlign.center),
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    onPressed: ref.read(authControllerProvider.notifier).retrySession,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Try again'),
                  ),
                  TextButton(
                    onPressed: () async {
                      await ref.read(authControllerProvider.notifier).signOut();
                    },
                    child: const Text('Clear session and sign in'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
