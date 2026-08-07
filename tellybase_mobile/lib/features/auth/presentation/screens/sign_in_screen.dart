import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tellybase_mobile/features/auth/presentation/controllers/auth_controller.dart';
import 'package:tellybase_mobile/features/auth/presentation/screens/sign_up_screen.dart';
import 'package:tellybase_mobile/features/auth/presentation/widgets/auth_scaffold.dart';

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _email = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  final _password = TextEditingController();
  var _obscurePassword = true;
  var _remember = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final error = auth.hasError ? auth.error.toString() : null;
    return AuthScaffold(
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Welcome back.', style: Theme.of(context).textTheme.displaySmall),
            const SizedBox(height: 12),
            Text(
              'Sign in to your private cloud and pick up exactly where you left off.',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 34),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Email address',
                prefixIcon: Icon(Icons.mail_outline_rounded),
              ),
              validator: (value) {
                final text = value?.trim() ?? '';
                return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(text)
                    ? null
                    : 'Enter a valid email address';
              },
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _password,
              obscureText: _obscurePassword,
              autofillHints: const [AutofillHints.password],
              onFieldSubmitted: (_) => _submit(),
              decoration: InputDecoration(
                labelText: 'Password',
                prefixIcon: const Icon(Icons.lock_outline_rounded),
                suffixIcon: IconButton(
                  onPressed: () => setState(
                    () => _obscurePassword = !_obscurePassword,
                  ),
                  icon: Icon(
                    _obscurePassword
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                  ),
                ),
              ),
              validator: (value) => (value?.isEmpty ?? true)
                  ? 'Enter your password'
                  : null,
            ),
            const SizedBox(height: 10),
            CheckboxListTile(
              value: _remember,
              contentPadding: EdgeInsets.zero,
              dense: true,
              controlAffinity: ListTileControlAffinity.leading,
              title: const Text('Keep me signed in'),
              onChanged: auth.isLoading
                  ? null
                  : (value) => setState(() => _remember = value ?? true),
            ),
            if (error != null) ...[
              const SizedBox(height: 8),
              _AuthError(message: error),
            ],
            const SizedBox(height: 20),
            FilledButton(
              onPressed: auth.isLoading ? null : _submit,
              child: auth.isLoading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.5),
                    )
                  : const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text('Sign in securely'),
                        SizedBox(width: 10),
                        Icon(Icons.arrow_forward_rounded, size: 20),
                      ],
                    ),
            ),
            const SizedBox(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  'New to TellyBase?',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                TextButton(
                  onPressed: auth.isLoading
                      ? null
                      : () => Navigator.of(context).push<void>(
                            MaterialPageRoute(builder: (_) => const SignUpScreen()),
                          ),
                  child: const Text('Create account'),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.shield_outlined,
                    size: 16,
                    color: Theme.of(context).colorScheme.secondary,
                  ),
                  const SizedBox(width: 7),
                  Text(
                    'Encrypted session · Private storage',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    FocusManager.instance.primaryFocus?.unfocus();
    if (!(_formKey.currentState?.validate() ?? false)) return;
    await ref.read(authControllerProvider.notifier).signIn(
          email: _email.text,
          password: _password.text,
          remember: _remember,
        );
  }
}

class _AuthError extends StatelessWidget {
  const _AuthError({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.error.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: Theme.of(context).colorScheme.error.withValues(alpha: 0.3),
        ),
      ),
      child: Text(
        message,
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      ),
    );
  }
}
