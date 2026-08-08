import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/di/providers.dart';
import '../../../../core/error/app_exception.dart';
import '../auth_state.dart';

/// Simple model for country dial codes.
class _CountryCode {
  const _CountryCode({
    required this.name,
    required this.iso,
    required this.dial,
    required this.flag,
    required this.example,
  });

  final String name;
  final String iso;
  final String dial; // without +
  final String flag;
  final String example;

  String get display => '$flag +$dial';
  String get dialWithPlus => '+$dial';
}

const _countries = <_CountryCode>[
  _CountryCode(name: 'United States', iso: 'US', dial: '1', flag: '🇺🇸', example: '415 555 2671'),
  _CountryCode(name: 'United Kingdom', iso: 'GB', dial: '44', flag: '🇬🇧', example: '7400 123456'),
  _CountryCode(name: 'India', iso: 'IN', dial: '91', flag: '🇮🇳', example: '98765 43210'),
  _CountryCode(name: 'Germany', iso: 'DE', dial: '49', flag: '🇩🇪', example: '151 23456789'),
  _CountryCode(name: 'France', iso: 'FR', dial: '33', flag: '🇫🇷', example: '6 12 34 56 78'),
  _CountryCode(name: 'Canada', iso: 'CA', dial: '1', flag: '🇨🇦', example: '416 555 0199'),
  _CountryCode(name: 'Australia', iso: 'AU', dial: '61', flag: '🇦🇺', example: '412 345 678'),
  _CountryCode(name: 'Brazil', iso: 'BR', dial: '55', flag: '🇧🇷', example: '11 91234 5678'),
  _CountryCode(name: 'Mexico', iso: 'MX', dial: '52', flag: '🇲🇽', example: '55 1234 5678'),
  _CountryCode(name: 'Spain', iso: 'ES', dial: '34', flag: '🇪🇸', example: '612 345 678'),
  _CountryCode(name: 'Italy', iso: 'IT', dial: '39', flag: '🇮🇹', example: '312 345 6789'),
  _CountryCode(name: 'Russia', iso: 'RU', dial: '7', flag: '🇷🇺', example: '912 345 6789'),
  _CountryCode(name: 'Japan', iso: 'JP', dial: '81', flag: '🇯🇵', example: '90 1234 5678'),
  _CountryCode(name: 'South Korea', iso: 'KR', dial: '82', flag: '🇰🇷', example: '10 1234 5678'),
  _CountryCode(name: 'China', iso: 'CN', dial: '86', flag: '🇨🇳', example: '131 2345 6789'),
  _CountryCode(name: 'UAE', iso: 'AE', dial: '971', flag: '🇦🇪', example: '50 123 4567'),
  _CountryCode(name: 'Saudi Arabia', iso: 'SA', dial: '966', flag: '🇸🇦', example: '50 123 4567'),
  _CountryCode(name: 'South Africa', iso: 'ZA', dial: '27', flag: '🇿🇦', example: '71 123 4567'),
  _CountryCode(name: 'Nigeria', iso: 'NG', dial: '234', flag: '🇳🇬', example: '802 123 4567'),
  _CountryCode(name: 'Pakistan', iso: 'PK', dial: '92', flag: '🇵🇰', example: '300 1234567'),
  _CountryCode(name: 'Turkey', iso: 'TR', dial: '90', flag: '🇹🇷', example: '501 234 56 78'),
  _CountryCode(name: 'Indonesia', iso: 'ID', dial: '62', flag: '🇮🇩', example: '812 3456 7890'),
  _CountryCode(name: 'Philippines', iso: 'PH', dial: '63', flag: '🇵🇭', example: '917 123 4567'),
  _CountryCode(name: 'Ukraine', iso: 'UA', dial: '380', flag: '🇺🇦', example: '50 123 4567'),
];

/// Phone-number entry with clear country-code UX.
/// Telegram requires E.164 format (e.g. +919876543210). This screen makes it
/// obvious that country code *must* be included, via a country picker + national
/// number split, plus live preview of the full number.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _phoneCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _busy = false;
  late _CountryCode _selected = _countries[2]; // default India for broader coverage, user changes easily

  @override
  void initState() {
    super.initState();
    // Try to guess default from device locale? keep US/IN as common default.
    _phoneCtrl.addListener(_onPhoneChanged);
  }

  void _onPhoneChanged() {
    // If user pastes full international number like +44 7400...
    final text = _phoneCtrl.text.trim();
    if (text.startsWith('+')) {
      final digits = text.replaceAll(RegExp(r'[^0-9]'), '');
      // Try to detect country code
      final sorted = [..._countries]..sort((a, b) => b.dial.length.compareTo(a.dial.length));
      for (final c in sorted) {
        if (digits.startsWith(c.dial)) {
          final national = digits.substring(c.dial.length);
          if (national.length >= 6) {
            if (mounted && c.iso != _selected.iso) {
              setState(() => _selected = c);
            }
            // Replace controller text with national part to avoid duplication
            final newNational = national.replaceFirst(RegExp(r'^0+'), '');
            if (newNational != _phoneCtrl.text.replaceAll(RegExp(r'[^0-9]'), '')) {
              // Defer to avoid loop
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (!mounted) return;
                _phoneCtrl.value = TextEditingValue(
                  text: newNational,
                  selection: TextSelection.collapsed(offset: newNational.length),
                );
              });
            }
            break;
          }
        }
      }
    }
    if (mounted) setState(() {}); // refresh preview
  }

  @override
  void dispose() {
    _phoneCtrl.removeListener(_onPhoneChanged);
    _phoneCtrl.dispose();
    super.dispose();
  }

  String _fullE164() {
    final national = _phoneCtrl.text.replaceAll(RegExp(r'[^0-9]'), '').replaceFirst(RegExp(r'^0+'), '');
    if (national.isEmpty) return '+${_selected.dial} …';
    return '+${_selected.dial}$national';
  }

  String _normalizeForApi() {
    final national = _phoneCtrl.text.replaceAll(RegExp(r'[^0-9]'), '').replaceFirst(RegExp(r'^0+'), '');
    // If user typed leading 0 like 0XXXXXXXX, we already stripped.
    // Return E164 with single +
    return '+${_selected.dial}$national';
  }

  String? _validate() {
    final raw = _phoneCtrl.text.trim();
    if (raw.isEmpty) return 'Enter your phone number';
    final digitsOnly = raw.replaceAll(RegExp(r'[^0-9]'), '');
    if (digitsOnly.length < 6) return 'Number is too short';
    if (digitsOnly.length > 15) return 'Number is too long';
    final full = _fullE164();
    final fullDigits = full.replaceAll(RegExp(r'[^0-9]'), '');
    if (fullDigits.length < 7 || fullDigits.length > 15) {
      return 'Include country code. Full number should be 7-15 digits';
    }
    // Basic E164 check
    if (!RegExp(r'^\+\d{7,15}$').hasMatch(full.replaceAll(' ', ''))) {
      return 'Enter a valid number with country code, e.g. ${_selected.display} ${ _selected.example}';
    }
    return null;
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() => _busy = true);
    try {
      final phone = _normalizeForApi();
      await ref.read(authControllerProvider.notifier).sendCode(phone);
      // Navigation handled by RootGate -> OtpScreen
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickCountry() async {
    final picked = await showModalBottomSheet<_CountryCode>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.7,
          maxChildSize: 0.9,
          builder: (_, controller) {
            return Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text('Select country',
                      style: Theme.of(ctx).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
                ),
                Expanded(
                  child: ListView.builder(
                    controller: controller,
                    itemCount: _countries.length,
                    itemBuilder: (c, i) {
                      final country = _countries[i];
                      final isSelected = country.iso == _selected.iso && country.dial == _selected.dial;
                      return ListTile(
                        leading: Text(country.flag, style: const TextStyle(fontSize: 24)),
                        title: Text(country.name),
                        subtitle: Text('+${country.dial}  e.g. ${country.example}'),
                        trailing: isSelected ? const Icon(Icons.check, color: Colors.green) : null,
                        selected: isSelected,
                        onTap: () => Navigator.pop(ctx, country),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 16),
              ],
            );
          },
        );
      },
    );
    if (picked != null && mounted) {
      setState(() => _selected = picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final auth = ref.watch(authControllerProvider);
    final isLoading = _busy || auth is AuthUnknown;
    String? errorText;
    String? errorCode;
    if (auth is AuthFailed) {
      errorText = auth.error.message;
      if (auth.error is RpcException) {
        errorCode = (auth.error as RpcException).code;
      }
    }

    final preview = _fullE164();
    final hasInput = _phoneCtrl.text.replaceAll(RegExp(r'[^0-9]'), '').isNotEmpty;

    return Scaffold(
      backgroundColor: colors.surface,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 8),
                    // Logo + title
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: colors.primaryContainer,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.photo_library_rounded, size: 42, color: colors.onPrimaryContainer),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Welcome to TellyBase',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.bold,
                            letterSpacing: -0.5,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Your private photo library, backed up invisibly to your own Telegram account. No extra cloud needed.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: colors.onSurfaceVariant,
                            height: 1.4,
                          ),
                    ),
                    const SizedBox(height: 28),

                    // Info card about country code
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: colors.secondaryContainer.withOpacity(0.7),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: colors.outlineVariant),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.info_outline_rounded, size: 20, color: colors.onSecondaryContainer),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Use your full number with country code',
                                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                                        fontWeight: FontWeight.w600,
                                        color: colors.onSecondaryContainer,
                                      ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Example: ${_selected.flag} +${_selected.dial} ${_selected.example}. You can paste +… or pick your country below.',
                                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                        color: colors.onSecondaryContainer,
                                      ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Country selector
                    Text('Country', style: Theme.of(context).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    InkWell(
                      onTap: isLoading ? null : _pickCountry,
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: colors.outline),
                          color: colors.surfaceContainerHighest.withOpacity(0.3),
                        ),
                        child: Row(
                          children: [
                            Text(_selected.flag, style: const TextStyle(fontSize: 22)),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(_selected.name, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
                                  Text('+${_selected.dial}', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colors.onSurfaceVariant)),
                                ],
                              ),
                            ),
                            Icon(Icons.keyboard_arrow_down_rounded, color: colors.onSurfaceVariant),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Phone field
                    Text('Phone number', style: Theme.of(context).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    TextFormField(
                      controller: _phoneCtrl,
                      keyboardType: TextInputType.phone,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9\s\-\(\)\+]')),
                      ],
                      autofocus: true,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(letterSpacing: 0.5, fontWeight: FontWeight.w500),
                      decoration: InputDecoration(
                        hintText: _selected.example,
                        hintStyle: TextStyle(color: colors.onSurfaceVariant.withOpacity(0.6)),
                        prefixIcon: Padding(
                          padding: const EdgeInsets.only(left: 14, right: 8),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.phone_android_rounded, size: 20, color: colors.onSurfaceVariant),
                              const SizedBox(width: 8),
                              Text('+${_selected.dial}',
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodyMedium
                                      ?.copyWith(fontWeight: FontWeight.w600, color: colors.onSurface)),
                              const SizedBox(width: 8),
                              Container(width: 1, height: 20, color: colors.outlineVariant),
                            ],
                          ),
                        ),
                        prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: colors.outline),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: colors.primary, width: 1.5),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                      ),
                      validator: (_) => _validate(),
                      onFieldSubmitted: (_) => _submit(),
                      enabled: !isLoading,
                    ),
                    const SizedBox(height: 10),
                    if (hasInput)
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: colors.surfaceContainerHigh,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.check_circle, size: 16, color: colors.primary),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'We’ll send code to $preview',
                                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                      fontWeight: FontWeight.w500,
                                      color: colors.onSurfaceVariant,
                                    ),
                              ),
                            ),
                          ],
                        ),
                      ),

                    const SizedBox(height: 22),

                    FilledButton.icon(
                      onPressed: isLoading ? null : _submit,
                      icon: isLoading
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.arrow_forward_rounded),
                      label: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Text(isLoading ? 'Connecting…' : 'Continue', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                      ),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 24),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                    ),

                    if (errorText != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: colors.errorContainer,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.error_outline_rounded, color: colors.onErrorContainer, size: 20),
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
                                    Padding(
                                      padding: const EdgeInsets.only(top: 4),
                                      child: Text(
                                        'Code: $errorCode',
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
                    Text(
                      'By continuing, you agree that TellyBase will use your Telegram account only to send you a login code and store encrypted photo backups in your Saved Messages. We never access chats or contacts.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: colors.onSurfaceVariant.withOpacity(0.8),
                            height: 1.4,
                          ),
                    ),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _friendlyError(String raw, String? code) {
    final lower = raw.toLowerCase();
    if (code != null) {
      if (code.contains('PHONE_NUMBER_INVALID') || lower.contains('phone_number_invalid')) {
        return 'That phone number looks invalid. Please check country code (+${_selected.dial}) and try again. Example: +${_selected.dial} ${_selected.example}';
      }
      if (code.contains('PHONE_NUMBER_BANNED')) {
        return 'This phone number is banned from Telegram.';
      }
      if (code.contains('FLOOD_WAIT')) {
        return 'Too many attempts. Please wait a few minutes before retrying.';
      }
      if (lower.contains('not connected')) {
        return 'Could not reach Telegram. Check internet and try again.';
      }
    }
    if (lower.contains('not connected')) {
      return 'Could not connect to Telegram. Check your internet connection and tap Continue again.';
    }
    if (lower.contains('could not send')) {
      return 'Could not send login code. Verify number is +CountryCode + number (e.g. +${_selected.dial} ${_selected.example}) and check internet.';
    }
    return raw;
  }
}
