import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/vault_provider.dart';
import 'vault_screen.dart';

class VaultLoginScreen extends ConsumerStatefulWidget {
  const VaultLoginScreen({super.key});

  @override
  ConsumerState<VaultLoginScreen> createState() => _VaultLoginScreenState();
}

class _VaultLoginScreenState extends ConsumerState<VaultLoginScreen> {
  final TextEditingController _pinController = TextEditingController();
  final TextEditingController _confirmController = TextEditingController();
  bool _isConfirming = false;
  String _firstPin = '';
  bool _busy = false;
  bool _obscureText = true;
  String? _errorMessage;

  @override
  void dispose() {
    _pinController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit(bool isConfigured) async {
    setState(() {
      _errorMessage = null;
      _busy = true;
    });

    try {
      if (!isConfigured) {
        // First-time creation
        if (!_isConfirming) {
          final entered = _pinController.text.trim();
          if (entered.length < 4) {
            setState(() {
              _errorMessage = 'PIN/password must be at least 4 characters long.';
              _busy = false;
            });
            return;
          }
          _firstPin = entered;
          _pinController.clear();
          setState(() {
            _isConfirming = true;
            _busy = false;
          });
          return;
        } else {
          final confirmed = _pinController.text.trim();
          if (confirmed != _firstPin) {
            setState(() {
              _errorMessage = 'PINs do not match. Please start over.';
              _isConfirming = false;
              _firstPin = '';
              _pinController.clear();
              _busy = false;
            });
            return;
          }
          await ref.read(vaultProvider.notifier).createVault(confirmed);
          if (!mounted) return;
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const VaultScreen()),
          );
        }
      } else {
        // Existing Vault unlock
        final pin = _pinController.text.trim();
        if (pin.isEmpty) {
          setState(() {
            _errorMessage = 'Please enter your Vault PIN/password.';
            _busy = false;
          });
          return;
        }
        final ok = await ref.read(vaultProvider.notifier).unlock(pin);
        if (!mounted) return;
        if (ok) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const VaultScreen()),
          );
        } else {
          setState(() {
            _errorMessage = 'Incorrect PIN/password. Please try again.';
            _pinController.clear();
            _busy = false;
          });
          HapticFeedback.vibrate();
        }
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(vaultProvider);
    final theme = Theme.of(context);

    final isConfigured = state.isConfigured;
    final title = !isConfigured
        ? (_isConfirming ? 'Confirm Vault PIN' : 'Create Vault PIN')
        : 'Hidden Vault';
    final subtitle = !isConfigured
        ? (_isConfirming
            ? 'Re-enter your PIN or password to verify.'
            : 'Set a secure PIN or password to encrypt your Hidden Vault.')
        : 'Enter your PIN or password to unlock encrypted media.';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Hidden Vault', style: TextStyle(fontWeight: FontWeight.w600)),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: theme.colorScheme.primaryContainer.withValues(alpha: 0.6),
                  ),
                  child: Icon(
                    Icons.lock_rounded,
                    size: 48,
                    color: theme.colorScheme.primary,
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  title,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 10),
                Text(
                  subtitle,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 32),
                TextField(
                  controller: _pinController,
                  obscureText: _obscureText,
                  autofocus: true,
                  keyboardType: TextInputType.visiblePassword,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _handleSubmit(isConfigured),
                  decoration: InputDecoration(
                    labelText: _isConfirming ? 'Confirm PIN/Password' : 'PIN/Password',
                    prefixIcon: const Icon(Icons.key_rounded),
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscureText
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                      ),
                      onPressed: () {
                        setState(() => _obscureText = !_obscureText);
                      },
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
                if (_errorMessage != null) ...[
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline_rounded,
                          color: Colors.redAccent, size: 18),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          _errorMessage!,
                          style: const TextStyle(
                              color: Colors.redAccent,
                              fontSize: 13,
                              fontWeight: FontWeight.w600),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 28),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton(
                    onPressed: _busy ? null : () => _handleSubmit(isConfigured),
                    style: FilledButton.styleFrom(
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: _busy
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.5,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            !isConfigured
                                ? (_isConfirming ? 'Confirm & Create' : 'Next')
                                : 'Unlock Vault',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ),
                if (!isConfigured && _isConfirming) ...[
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () {
                      setState(() {
                        _isConfirming = false;
                        _firstPin = '';
                        _errorMessage = null;
                        _pinController.clear();
                      });
                    },
                    child: const Text('Start Over'),
                  ),
                ],
                const SizedBox(height: 24),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    'Encryption is applied locally BEFORE uploading. Telegram copies remain encrypted and unusable without this PIN.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.8),
                      fontSize: 12,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
