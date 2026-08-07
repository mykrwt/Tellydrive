import 'package:flutter/material.dart';

abstract final class AppTheme {
  static const _background = Color(0xFF080B14);
  static const _surface = Color(0xFF111624);
  static const _surfaceHigh = Color(0xFF171D2D);
  static const _primary = Color(0xFF8995FF);
  static const _secondary = Color(0xFF58D5C9);

  static ThemeData get dark {
    final scheme = ColorScheme.fromSeed(
      seedColor: _primary,
      brightness: Brightness.dark,
      surface: _surface,
    ).copyWith(
      primary: _primary,
      onPrimary: const Color(0xFF11142A),
      secondary: _secondary,
      onSecondary: const Color(0xFF05211E),
      surface: _surface,
      surfaceContainer: _surfaceHigh,
      surfaceContainerHigh: const Color(0xFF1D2436),
      error: const Color(0xFFFF7D8A),
      outline: const Color(0xFF313A50),
    );

    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: _background,
      fontFamily: 'sans-serif',
    );
    return base.copyWith(
      textTheme: base.textTheme.copyWith(
        displaySmall: const TextStyle(
          color: Color(0xFFF5F6FC),
          fontSize: 36,
          fontWeight: FontWeight.w800,
          height: 1.05,
          letterSpacing: -1.5,
        ),
        headlineMedium: const TextStyle(
          color: Color(0xFFF5F6FC),
          fontSize: 27,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.8,
        ),
        titleLarge: const TextStyle(
          color: Color(0xFFF2F4FB),
          fontSize: 20,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
        ),
        titleMedium: const TextStyle(
          color: Color(0xFFF0F2FA),
          fontWeight: FontWeight.w700,
        ),
        bodyLarge: const TextStyle(
          color: Color(0xFFD6DAE6),
          fontSize: 16,
          height: 1.5,
        ),
        bodyMedium: const TextStyle(
          color: Color(0xFF9EA6B9),
          fontSize: 14,
          height: 1.45,
        ),
        labelLarge: const TextStyle(fontWeight: FontWeight.w700),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: _background,
        foregroundColor: Color(0xFFF4F5FA),
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: _surfaceHigh,
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 17),
        hintStyle: const TextStyle(color: Color(0xFF747E94)),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: Color(0xFF242C40)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: _primary, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide(color: scheme.error),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(64, 54),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(17)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(64, 52),
          side: const BorderSide(color: Color(0xFF313A50)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(17)),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 76,
        backgroundColor: const Color(0xFF0D111C),
        indicatorColor: _primary.withValues(alpha: 0.16),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            color: states.contains(WidgetState.selected)
                ? const Color(0xFFDDE0FF)
                : const Color(0xFF7F889C),
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: const Color(0xFF222A3D),
        contentTextStyle: const TextStyle(color: Colors.white),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      dividerColor: const Color(0xFF222A3C),
    );
  }
}
