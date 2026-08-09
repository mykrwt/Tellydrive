import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'core/routing/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/settings/presentation/providers/settings_provider.dart';

class TeleDriveApp extends ConsumerStatefulWidget {
  const TeleDriveApp({super.key});

  @override
  ConsumerState<TeleDriveApp> createState() => _TeleDriveAppState();
}

class _TeleDriveAppState extends ConsumerState<TeleDriveApp>
    with WidgetsBindingObserver {
  bool _settingsLoaded = false;
  bool _locked = false;
  bool _authenticating = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadSettings();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _authenticateIfNeeded();
  }

  Future<void> _loadSettings() async {
    await SettingsService.load(ref);
    final prefs = await SharedPreferences.getInstance();
    final shouldLock = prefs.getBool('biometric_lock') ?? false;
    if (mounted) {
      setState(() {
        _locked = shouldLock;
        _settingsLoaded = true;
      });
    }
    if (shouldLock) await _authenticateIfNeeded();
  }

  Future<void> _authenticateIfNeeded() async {
    final prefs = await SharedPreferences.getInstance();
    if (!(prefs.getBool('biometric_lock') ?? false) || _authenticating) return;
    if (mounted) setState(() {
      _locked = true;
      _authenticating = true;
    });
    try {
      final authenticated = await LocalAuthentication().authenticate(
        localizedReason: 'Unlock your Telegram-backed files',
      );
      if (mounted) setState(() => _locked = !authenticated);
    } catch (_) {
      if (mounted) setState(() => _locked = true);
    } finally {
      if (mounted) {
        setState(() => _authenticating = false);
      } else {
        _authenticating = false;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final themeMode = ref.watch(themeModeProvider);

    if (!_settingsLoaded || _locked) {
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.lightTheme,
        darkTheme: AppTheme.darkTheme,
        themeMode: themeMode,
        home: Scaffold(
          body: Center(
            child: !_settingsLoaded
                ? const CircularProgressIndicator()
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.lock_outline_rounded, size: 56),
                      const SizedBox(height: 16),
                      const Text('TeleDrive is locked',
                          style: TextStyle(
                              fontSize: 20, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        onPressed:
                            _authenticating ? null : _authenticateIfNeeded,
                        icon: const Icon(Icons.fingerprint),
                        label: const Text('Unlock'),
                      ),
                    ],
                  ),
          ),
        ),
      );
    }

    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'TeleDrive',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: themeMode,
      routerConfig: router,
      builder: (context, child) {
        final brightness = Theme.of(context).brightness;

        SystemChrome.setSystemUIOverlayStyle(
          SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: brightness == Brightness.dark
                ? Brightness.light
                : Brightness.dark,
            systemNavigationBarColor: Theme.of(context).colorScheme.surface,
            systemNavigationBarIconBrightness: brightness == Brightness.dark
                ? Brightness.light
                : Brightness.dark,
          ),
        );

        return child ?? const SizedBox.shrink();
      },
    );
  }
}
