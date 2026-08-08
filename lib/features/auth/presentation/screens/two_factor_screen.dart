import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/di/providers.dart';
import '../../../../core/error/app_exception.dart';
import '../auth_state.dart';

/// Two-step verification (2FA) password entry. Only shown when the account has
/// a password set; otherwise the app never asks for one.
class TwoFactorScreen extends ConsumerStatefulWidget {
  const TwoFactorScreen({super.key});

  @override
  ConsumerState<TwoFactorScreen> createState() => _TwoFactorScreenState();
}

class _TwoFactorScreenState extends ConsumerState<TwoFactorScreen> {
  final _password = TextEditingController();
  bool _obscure = true;
  bool _busy = false;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_password.text.isEmpty) return;
    setState(() => _busy = true);
    try {
      await ref.read(authControllerProvider.notifier).submitPassword(_password.text);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final colors = Theme.of(context).colorScheme;

    String? errorText;
    String? errorCode;
    if (auth is AuthFailed) {
      errorText = auth.error.message;
      if (auth.error is RpcException) {
        errorCode = (auth.error as RpcException).code;
      }
    }

    return Scaffold(
      backgroundColor: colors.surface,
      appBar: AppBar(
        title: const Text('Two-step verification'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => ref.read(authControllerProvider.notifier).signOut(),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: colors.secondaryContainer,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(Icons.lock_rounded, size: 36, color: colors.onSecondaryContainer),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'Password protected',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Your Telegram account has two-step verification enabled. Enter your Telegram password (not the SMS code) to continue.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: colors.onSurfaceVariant,
                          height: 1.4,
                        ),
                  ),
                  const SizedBox(height: 28),
                  TextField(
                    controller: _password,
                    obscureText: _obscure,
                    autofocus: true,
                    enabled: !_busy,
                    textInputAction: TextInputAction.done,
                    decoration: InputDecoration(
                      labelText: 'Telegram password',
                      hintText: 'Your 2FA password',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(color: colors.primary, width: 1.6),
                      ),
                      suffixIcon: IconButton(
                        icon: Icon(_obscure ? Icons.visibility_off_rounded : Icons.visibility_rounded),
                        onPressed: () => setState(() => _obscure = !_obscure),
                      ),
                    ),
                    onSubmitted: (_) => _submit(),
                  ),
                  if (errorText != null) ...[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: colors.errorContainer,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.error_outline_rounded, size: 20, color: colors.onErrorContainer),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _friendlyError(errorText, errorCode),
                                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                        color: colors.onErrorContainer,
                                        fontWeight: FontWeight.w500,
                                      ),
                                ),
                                if (errorCode != null)
                                  Text(errorCode,
                                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                            color: colors.onErrorContainer.withOpacity(0.7),
                                          )),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _busy ? null : _submit,
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: _busy
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Unlock', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: _busy ? null : () => ref.read(authControllerProvider.notifier).signOut(),
                    child: const Text('Back to sign-in'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _friendlyError(String raw, String? code) {
    if (code == 'PASSWORD_HASH_INVALID' || code == 'SRP_ID_INVALID') {
      return 'Wrong password. Try again.';
    }
    if (raw.toLowerCase().contains('password')) {
      return raw;
    }
    return raw;
  }
}
