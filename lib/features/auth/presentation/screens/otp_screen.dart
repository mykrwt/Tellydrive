import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/di/providers.dart';
import '../../../../core/error/app_exception.dart';
import '../auth_state.dart';

/// OTP entry. Handles phone/Telegram-app codes and surfaces invalid/expired
/// code errors from the controller.
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key});

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _code = TextEditingController();
  final _focus = FocusNode();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  @override
  void dispose() {
    _code.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final code = _code.text.trim();
    if (code.length < 4) return;
    setState(() => _busy = true);
    try {
      await ref.read(authControllerProvider.notifier).submitCode(code);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final colors = Theme.of(context).colorScheme;

    String? phone = 'your phone';
    bool viaApp = false;
    if (auth is AuthCodeRequested) {
      phone = auth.phone;
      viaApp = auth.viaApp;
    } else {
      // After failure, controller keeps last phone
      final last = ref.read(authControllerProvider.notifier).lastPhone;
      if (last != null) phone = last;
    }

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
        title: const Text('Verification code'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () {
            // Go back to sign-in to edit number
            ref.read(authControllerProvider.notifier).signOut();
          },
        ),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: colors.primaryContainer.withOpacity(0.6),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(Icons.mark_chat_read_rounded, size: 36, color: colors.onPrimaryContainer),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'Check your Telegram',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  RichText(
                    textAlign: TextAlign.center,
                    text: TextSpan(
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: colors.onSurfaceVariant,
                            height: 1.4,
                          ),
                      children: [
                        TextSpan(text: viaApp ? 'We sent a code via your ' : 'Telegram sent a code via SMS to '),
                        TextSpan(
                          text: phone,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        TextSpan(
                          text: viaApp
                              ? ' Telegram app. Open Telegram on another device to get it.'
                              : '. It may take up to a minute.',
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 28),

                  TextField(
                    controller: _code,
                    focusNode: _focus,
                    keyboardType: TextInputType.number,
                    textAlign: TextAlign.center,
                    autofocus: true,
                    maxLength: 6,
                    enabled: !_busy,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                          fontSize: 30,
                          letterSpacing: 12,
                          fontWeight: FontWeight.w700,
                        ),
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(
                      counterText: '',
                      hintText: '• • • • •',
                      hintStyle: TextStyle(letterSpacing: 12, color: colors.onSurfaceVariant.withOpacity(0.4)),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: BorderSide(color: colors.primary, width: 1.8),
                      ),
                      contentPadding: const EdgeInsets.symmetric(vertical: 18),
                    ),
                    onSubmitted: (_) => _submit(),
                    onChanged: (v) {
                      if (v.length == 5 || v.length == 6) {
                        // Auto-submit when 5-6 digits for Telegram (can be 5 digits)
                        _submit();
                      }
                    },
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
                                  _friendlyCodeError(errorText, errorCode),
                                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                        color: colors.onErrorContainer,
                                        fontWeight: FontWeight.w500,
                                      ),
                                ),
                                if (errorCode != null)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 2),
                                    child: Text(
                                      errorCode,
                                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                            color: colors.onErrorContainer.withOpacity(0.7),
                                          ),
                                    ),
                                  ),
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
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Text('Verify', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                  ),
                  const SizedBox(height: 12),
                  TextButton.icon(
                    onPressed: _busy
                        ? null
                        : () {
                            ref.read(authControllerProvider.notifier).signOut();
                          },
                    icon: const Icon(Icons.edit_rounded, size: 18),
                    label: const Text('Wrong number? Edit'),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Tip: Telegram codes are usually 5 digits. If code expired, go back and request a new one.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: colors.onSurfaceVariant.withOpacity(0.7),
                        ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _friendlyCodeError(String raw, String? code) {
    final lower = raw.toLowerCase();
    if (code == 'PHONE_CODE_INVALID' || lower.contains('phone_code_invalid')) {
      return 'Invalid code. Please check and try again.';
    }
    if (code == 'PHONE_CODE_EXPIRED' || lower.contains('phone_code_expired')) {
      return 'Code expired. Go back and tap Continue to get a new code.';
    }
    if (code == 'PHONE_CODE_EMPTY') {
      return 'Enter the code you received.';
    }
    if (lower.contains('flood')) {
      return 'Too many attempts. Wait a few minutes.';
    }
    return raw;
  }
}
