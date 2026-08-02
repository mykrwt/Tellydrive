import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

/// TellyBase's design language deliberately mirrors iOS/iPadOS: SF-style
/// system typography, translucent blurred surfaces, generous corner radii,
/// spring-like motion, and a restrained accent color used sparingly against
/// large areas of neutral background — the same visual grammar as Photos,
/// Files and iCloud Drive on Apple platforms.
class AppColors {
  const AppColors._();

  // Apple's "system blue" family — used for the primary accent everywhere.
  static const Color systemBlue = Color(0xFF0A84FF);
  static const Color systemBlueLight = Color(0xFF007AFF);
  static const Color systemGreen = Color(0xFF30D158);
  static const Color systemOrange = Color(0xFFFF9F0A);
  static const Color systemRed = Color(0xFFFF453A);
  static const Color systemPurple = Color(0xFFBF5AF2);
  static const Color systemPink = Color(0xFFFF375F);
  static const Color systemYellow = Color(0xFFFFD60A);
  static const Color systemTeal = Color(0xFF64D2FF);

  // Backgrounds — light theme (iOS "systemGroupedBackground" family).
  static const Color lightBg = Color(0xFFF2F2F7);
  static const Color lightSecondaryBg = Color(0xFFFFFFFF);
  static const Color lightTertiaryBg = Color(0xFFE5E5EA);
  static const Color lightSeparator = Color(0xFFC6C6C8);
  static const Color lightLabel = Color(0xFF1C1C1E);
  static const Color lightSecondaryLabel = Color(0xFF6C6C70);

  // Backgrounds — dark theme.
  static const Color darkBg = Color(0xFF000000);
  static const Color darkSecondaryBg = Color(0xFF1C1C1E);
  static const Color darkTertiaryBg = Color(0xFF2C2C2E);
  static const Color darkSeparator = Color(0xFF38383A);
  static const Color darkLabel = Color(0xFFF2F2F7);
  static const Color darkSecondaryLabel = Color(0xFF98989F);
}

class AppTheme {
  const AppTheme._();

  static const String fontFamily = '.SF Pro Text';
  static const String displayFontFamily = '.SF Pro Display';

  static ThemeData light = _buildTheme(Brightness.light);
  static ThemeData dark = _buildTheme(Brightness.dark);

  static ThemeData _buildTheme(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final bg = isDark ? AppColors.darkBg : AppColors.lightBg;
    final surface = isDark ? AppColors.darkSecondaryBg : AppColors.lightSecondaryBg;
    final label = isDark ? AppColors.darkLabel : AppColors.lightLabel;
    final secondaryLabel = isDark ? AppColors.darkSecondaryLabel : AppColors.lightSecondaryLabel;
    final separator = isDark ? AppColors.darkSeparator : AppColors.lightSeparator;

    final colorScheme = ColorScheme(
      brightness: brightness,
      primary: AppColors.systemBlue,
      onPrimary: Colors.white,
      secondary: AppColors.systemPurple,
      onSecondary: Colors.white,
      error: AppColors.systemRed,
      onError: Colors.white,
      surface: surface,
      onSurface: label,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: bg,
      colorScheme: colorScheme,
      fontFamily: fontFamily,
      splashFactory: NoSplash.splashFactory,
      highlightColor: Colors.transparent,
      dividerColor: separator,
      appBarTheme: AppBarTheme(
        backgroundColor: bg.withOpacity(0.72),
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        foregroundColor: label,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: displayFontFamily,
          fontSize: 34,
          fontWeight: FontWeight.w700,
          color: label,
          letterSpacing: 0.37,
        ),
      ),
      textTheme: TextTheme(
        displayLarge: TextStyle(
          fontFamily: displayFontFamily,
          fontSize: 34,
          fontWeight: FontWeight.w700,
          color: label,
        ),
        headlineMedium: TextStyle(
          fontFamily: displayFontFamily,
          fontSize: 22,
          fontWeight: FontWeight.w700,
          color: label,
        ),
        titleLarge: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: label),
        titleMedium: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: label),
        bodyLarge: TextStyle(fontSize: 17, color: label),
        bodyMedium: TextStyle(fontSize: 15, color: label),
        bodySmall: TextStyle(fontSize: 13, color: secondaryLabel),
        labelSmall: TextStyle(fontSize: 11, color: secondaryLabel, fontWeight: FontWeight.w500),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        margin: EdgeInsets.zero,
      ),
      listTileTheme: ListTileThemeData(
        iconColor: secondaryLabel,
        textColor: label,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: bg.withOpacity(0.9),
        elevation: 0,
        height: 64,
        indicatorColor: AppColors.systemBlue.withOpacity(0.15),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 11,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
            color: selected ? AppColors.systemBlue : secondaryLabel,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(color: selected ? AppColors.systemBlue : secondaryLabel);
        }),
      ),
      dividerTheme: DividerThemeData(color: separator, thickness: 0.5, space: 0.5),
      pageTransitionsTheme: const PageTransitionsTheme(builders: {
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.android: CupertinoPageTransitionsBuilder(),
        TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.windows: CupertinoPageTransitionsBuilder(),
        TargetPlatform.linux: CupertinoPageTransitionsBuilder(),
      }),
    );
  }

  static Color surfaceOf(BuildContext context) => Theme.of(context).colorScheme.surface;
  static Color labelOf(BuildContext context) => Theme.of(context).colorScheme.onSurface;
  static Color secondaryLabelOf(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark
          ? AppColors.darkSecondaryLabel
          : AppColors.lightSecondaryLabel;
  static Color groupedBgOf(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? AppColors.darkBg : AppColors.lightBg;
  static Color tertiaryBgOf(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark
          ? AppColors.darkTertiaryBg
          : AppColors.lightTertiaryBg;
}

/// Standard iOS-style spring curve used across TellyBase's screen and
/// widget transitions.
class AppMotion {
  const AppMotion._();
  static const Curve springCurve = Curves.easeOutCubic;
  static const Duration fast = Duration(milliseconds: 220);
  static const Duration medium = Duration(milliseconds: 360);
  static const Duration slow = Duration(milliseconds: 520);
}
