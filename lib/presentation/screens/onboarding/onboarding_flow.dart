import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../state/auth_controller.dart';
import '../../widgets/telly_button.dart';
import 'widgets/otp_field.dart';
import 'widgets/phone_field.dart';

/// The single entry point into TellyBase: sign in with the user's own
/// Telegram account (phone number -> OTP -> optional 2FA password), which
/// is the entirety of TellyBase's "authentication system" — there is no
/// separate TellyBase account, password, or server-side session.
class OnboardingFlow extends ConsumerStatefulWidget {
  const OnboardingFlow({super.key});

  @override
  ConsumerState<OnboardingFlow> createState() => _OnboardingFlowState();
}

class _OnboardingFlowState extends ConsumerState<OnboardingFlow> {
  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);

    return Scaffold(
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: AppMotion.medium,
          switchInCurve: Curves.easeOutCubic,
          switchOutCurve: Curves.easeInCubic,
          transitionBuilder: (child, animation) => FadeTransition(
            opacity: animation,
            child: SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(0.08, 0),
                end: Offset.zero,
              ).animate(animation),
              child: child,
            ),
          ),
          child: switch (auth.uiState) {
            AuthUiState.needsOtp => _OtpStep(key: const ValueKey('otp')),
            AuthUiState.needsPassword => _PasswordStep(key: const ValueKey('pwd')),
            AuthUiState.error => _ErrorStep(key: const ValueKey('err'), message: auth.errorMessage),
            _ => _PhoneStep(key: const ValueKey('phone')),
          },
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.title, required this.subtitle});
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Hero(
          tag: 'tellybase-logo',
          child: Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: const LinearGradient(
                colors: [AppColors.systemBlue, AppColors.systemPurple],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              boxShadow: [
                BoxShadow(
                  color: AppColors.systemBlue.withOpacity(0.35),
                  blurRadius: 24,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: const Icon(CupertinoIcons.cloud_fill, color: Colors.white, size: 32),
          ),
        ),
        const SizedBox(height: 28),
        Text(title, style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 8),
        Text(
          subtitle,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: AppTheme.secondaryLabelOf(context),
              ),
        ),
      ],
    );
  }
}

class _PhoneStep extends ConsumerStatefulWidget {
  const _PhoneStep({super.key});
  @override
  ConsumerState<_PhoneStep> createState() => _PhoneStepState();
}

class _PhoneStepState extends ConsumerState<_PhoneStep> {
  final _controller = TextEditingController(text: '+91');

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const _Header(
            title: 'Your Telegram\nis your cloud.',
            subtitle: 'Sign in with your Telegram phone number. TellyBase '
                'never sees your password — Telegram handles the login, '
                'and your files never touch any TellyBase server.',
          ),
          const SizedBox(height: 36),
          PhoneField(controller: _controller),
          if (auth.errorMessage != null) ...[
            const SizedBox(height: 12),
            Text(auth.errorMessage!, style: const TextStyle(color: AppColors.systemRed)),
          ],
          const SizedBox(height: 24),
          TellyButton(
            label: 'Send Code',
            isLoading: auth.isBusy,
            onPressed: () => ref.read(authControllerProvider.notifier).submitPhoneNumber(_controller.text.trim()),
          ),
          const SizedBox(height: 16),
          Center(
            child: Text(
              'No custom backend. No third-party servers.\nJust you and your own Telegram account.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }
}

class _OtpStep extends ConsumerStatefulWidget {
  const _OtpStep({super.key});
  @override
  ConsumerState<_OtpStep> createState() => _OtpStepState();
}

class _OtpStepState extends ConsumerState<_OtpStep> {
  final _controller = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          _Header(
            title: 'Enter the code',
            subtitle: 'Telegram sent a login code to ${auth.phoneNumber ?? 'your account'}. '
                'Check the Telegram app itself (or SMS) — TellyBase can\'t see or send this code.',
          ),
          const SizedBox(height: 36),
          OtpField(controller: _controller),
          if (auth.errorMessage != null) ...[
            const SizedBox(height: 12),
            Text(auth.errorMessage!, style: const TextStyle(color: AppColors.systemRed)),
          ],
          const SizedBox(height: 24),
          TellyButton(
            label: 'Verify',
            isLoading: auth.isBusy,
            onPressed: () => ref.read(authControllerProvider.notifier).submitOtp(_controller.text.trim()),
          ),
          const SizedBox(height: 12),
          Center(
            child: TextButton(
              onPressed: () => ref.read(authControllerProvider.notifier).resendCode(),
              child: const Text('Resend code'),
            ),
          ),
        ],
      ),
    );
  }
}

class _PasswordStep extends ConsumerStatefulWidget {
  const _PasswordStep({super.key});
  @override
  ConsumerState<_PasswordStep> createState() => _PasswordStepState();
}

class _PasswordStepState extends ConsumerState<_PasswordStep> {
  final _controller = TextEditingController();
  bool _obscure = true;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const _Header(
            title: 'Two-Step\nVerification',
            subtitle: 'Your account has an extra Telegram cloud password enabled. '
                'Enter it to finish signing in — it\'s verified directly with '
                'Telegram and never stored by TellyBase.',
          ),
          const SizedBox(height: 36),
          TextField(
            controller: _controller,
            obscureText: _obscure,
            decoration: InputDecoration(
              filled: true,
              fillColor: AppTheme.tertiaryBgOf(context),
              hintText: 'Cloud password',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
              suffixIcon: IconButton(
                icon: Icon(_obscure ? CupertinoIcons.eye : CupertinoIcons.eye_slash),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
          ),
          if (auth.errorMessage != null) ...[
            const SizedBox(height: 12),
            Text(auth.errorMessage!, style: const TextStyle(color: AppColors.systemRed)),
          ],
          const SizedBox(height: 24),
          TellyButton(
            label: 'Unlock',
            isLoading: auth.isBusy,
            onPressed: () => ref.read(authControllerProvider.notifier).submitPassword(_controller.text),
          ),
        ],
      ),
    );
  }
}

class _ErrorStep extends ConsumerWidget {
  const _ErrorStep({super.key, this.message});
  final String? message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(CupertinoIcons.exclamationmark_triangle, size: 48, color: AppColors.systemOrange),
          const SizedBox(height: 16),
          Text('Couldn\'t connect to Telegram', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 8),
          Text(message ?? 'Unknown error', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 24),
          TellyButton(label: 'Try Again', onPressed: () => ref.invalidate(authControllerProvider)),
        ],
      ),
    );
  }
}
