import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/routing/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/settings/presentation/providers/settings_provider.dart';
import 'services/permissions/background_permission_service.dart';

class TeleDriveApp extends ConsumerStatefulWidget {
  const TeleDriveApp({super.key});

  @override
  ConsumerState<TeleDriveApp> createState() => _TeleDriveAppState();
}

class _TeleDriveAppState extends ConsumerState<TeleDriveApp> {
  bool _settingsLoaded = false;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    await SettingsService.load(ref);
    if (mounted) {
      setState(() => _settingsLoaded = true);
    }
    // Request background permissions on first launch after first frame.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) BackgroundPermissionService.requestIfNeeded(context);
    });
  }

  @override
  Widget build(BuildContext context) {
    final themeMode = ref.watch(themeModeProvider);

    if (!_settingsLoaded) {
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.lightTheme,
        darkTheme: AppTheme.darkTheme,
        themeMode: themeMode,
        home: const Scaffold(body: Center(child: CircularProgressIndicator())),
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
