import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_colors.dart';

class AppTheme {
  AppTheme._();

  static ThemeData get darkTheme {
    final base = ThemeData.dark(useMaterial3: true);

    const textPrimary = AppColors.textPrimaryDark;
    const textSecondary = AppColors.textSecondaryDark;
    const textHint = AppColors.textHintDark;

    return base.copyWith(
      colorScheme: const ColorScheme.dark(
        primary: Color(0xFFFFFFFF),
        onPrimary: Color(0xFF0F1115),
        primaryContainer: AppColors.cardDarkAlt,
        onPrimaryContainer: textPrimary,
        secondary: Color(0xFFE5E7EB),
        onSecondary: Color(0xFF0F1115),
        secondaryContainer: AppColors.cardDark,
        onSecondaryContainer: textPrimary,
        tertiary: AppColors.tertiary,
        onTertiary: AppColors.defaultBlackText,
        tertiaryContainer: AppColors.tertiaryContainer,
        surface: AppColors.surfaceDark,
        surfaceContainerHighest: AppColors.surfaceVariantDark,
        onSurface: textPrimary,
        onSurfaceVariant: textSecondary,
        error: AppColors.error,
        onError: Colors.white,
        outline: AppColors.dividerDark,
        shadow: Colors.black,
      ),
      scaffoldBackgroundColor: AppColors.backgroundDark,
      textTheme: _buildTextTheme(textPrimary, textSecondary),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.backgroundDark,
        foregroundColor: textPrimary,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        shadowColor: Colors.transparent,
        centerTitle: false,
        titleTextStyle: GoogleFonts.poppins(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: textPrimary,
          letterSpacing: -0.3,
        ),
        iconTheme: const IconThemeData(
          color: textPrimary,
          size: 24,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.cardDark,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: AppColors.dividerDark.withValues(alpha: 0.45),
          ),
        ),
      ),
      inputDecorationTheme: _buildInputTheme(
        fillColor: AppColors.cardDarkAlt,
        borderColor: AppColors.dividerDark.withValues(alpha: 0.65),
        focusColor: const Color(0xFFFFFFFF),
        textColor: textPrimary,
        hintColor: textHint,
      ),
      elevatedButtonTheme: _buildElevatedButtonTheme(),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: const Color(0xFFFFFFFF),
          foregroundColor: const Color(0xFF0F1115),
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          textStyle: GoogleFonts.poppins(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: _buildOutlinedButtonTheme(
        AppColors.dividerDark.withValues(alpha: 0.7),
        textPrimary,
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: const Color(0xFFFFFFFF),
          textStyle: GoogleFonts.poppins(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      dividerTheme: DividerThemeData(
        color: AppColors.dividerDark.withValues(alpha: 0.45),
        thickness: 1,
        space: 0,
      ),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        iconColor: Color(0xFFFFFFFF),
        textColor: textPrimary,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.cardDark,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        showDragHandle: true,
        dragHandleColor: AppColors.dividerDark,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.cardDarkAlt,
        selectedColor: const Color(0xFF2B3039),
        labelStyle: GoogleFonts.poppins(
          fontSize: 13,
          color: textPrimary,
        ),
        side: BorderSide(
          color: AppColors.dividerDark.withValues(alpha: 0.5),
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        checkmarkColor: const Color(0xFFFFFFFF),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.cardDarkAlt,
        contentTextStyle: GoogleFonts.poppins(
          color: textPrimary,
          fontSize: 14,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
        behavior: SnackBarBehavior.floating,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.surfaceDark,
        selectedItemColor: Color(0xFFFFFFFF),
        unselectedItemColor: AppColors.glassTabUnselected,
        selectedLabelStyle: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
        unselectedLabelStyle: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: Color(0xFFFFFFFF),
        foregroundColor: Color(0xFF0F1115),
        elevation: 2,
        shape: StadiumBorder(),
      ),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }

  static ThemeData get lightTheme {
    final base = ThemeData.light(useMaterial3: true);

    const textPrimary = AppColors.textPrimaryLight;
    const textSecondary = AppColors.textSecondaryLight;
    const textHint = AppColors.textHintLight;

    return base.copyWith(
      colorScheme: const ColorScheme.light(
        primary: Color(0xFF141619),
        onPrimary: Color(0xFFFFFFFF),
        primaryContainer: AppColors.primaryContainer,
        onPrimaryContainer: Color(0xFF141619),
        secondary: Color(0xFF4B5563),
        onSecondary: Color(0xFFFFFFFF),
        secondaryContainer: AppColors.secondaryContainer,
        onSecondaryContainer: Color(0xFF141619),
        tertiary: AppColors.tertiary,
        onTertiary: AppColors.defaultBlackText,
        tertiaryContainer: AppColors.tertiaryContainer,
        surface: AppColors.surfaceLight,
        surfaceContainerHighest: AppColors.surfaceVariantLight,
        onSurface: textPrimary,
        onSurfaceVariant: textSecondary,
        error: AppColors.error,
        onError: Colors.white,
        outline: AppColors.dividerLight,
        shadow: Colors.black,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.lightBg,
        selectedItemColor: Color(0xFF141619),
        unselectedItemColor: Color(0xFF6B7280),
        selectedLabelStyle: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
        unselectedLabelStyle: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      scaffoldBackgroundColor: AppColors.surfaceLight,
      textTheme: _buildTextTheme(textPrimary, textSecondary),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.lightBg,
        foregroundColor: textPrimary,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        shadowColor: Colors.transparent,
        centerTitle: false,
        titleTextStyle: GoogleFonts.poppins(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: textPrimary,
          letterSpacing: -0.3,
        ),
        iconTheme: const IconThemeData(
          color: textPrimary,
          size: 24,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.cardLight,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: AppColors.dividerLight.withValues(alpha: 0.8),
          ),
        ),
      ),
      inputDecorationTheme: _buildInputTheme(
        fillColor: AppColors.lightSurface,
        borderColor: AppColors.lightDivider,
        focusColor: const Color(0xFF141619),
        textColor: textPrimary,
        hintColor: textHint,
      ),
      elevatedButtonTheme: _buildElevatedButtonTheme(),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: const Color(0xFF141619),
          foregroundColor: const Color(0xFFFFFFFF),
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          textStyle: GoogleFonts.poppins(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: _buildOutlinedButtonTheme(
        AppColors.dividerLight,
        textPrimary,
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: const Color(0xFF141619),
          textStyle: GoogleFonts.poppins(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.dividerLight,
        thickness: 1,
        space: 0,
      ),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        iconColor: Color(0xFF141619),
        textColor: textPrimary,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.cardLight,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        showDragHandle: true,
        dragHandleColor: AppColors.lightDivider,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.lightSurface,
        selectedColor: const Color(0xFFE5E7EC),
        labelStyle: GoogleFonts.poppins(
          fontSize: 13,
          color: textPrimary,
        ),
        side: BorderSide(
          color: AppColors.lightDivider.withValues(alpha: 0.9),
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        checkmarkColor: const Color(0xFF141619),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: const Color(0xFF141619),
        contentTextStyle: GoogleFonts.poppins(
          color: Colors.white,
          fontSize: 14,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
        behavior: SnackBarBehavior.floating,
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: Color(0xFF141619),
        foregroundColor: Color(0xFFFFFFFF),
        elevation: 2,
        shape: StadiumBorder(),
      ),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }

  static TextTheme _buildTextTheme(Color primary, Color secondary) {
    return TextTheme(
      displayLarge: GoogleFonts.poppins(
        fontSize: 57,
        fontWeight: FontWeight.w400,
        color: primary,
      ),
      displayMedium: GoogleFonts.poppins(
        fontSize: 45,
        fontWeight: FontWeight.w400,
        color: primary,
      ),
      displaySmall: GoogleFonts.poppins(
        fontSize: 36,
        fontWeight: FontWeight.w400,
        color: primary,
      ),
      headlineLarge: GoogleFonts.poppins(
        fontSize: 32,
        fontWeight: FontWeight.w500,
        color: primary,
      ),
      headlineMedium: GoogleFonts.poppins(
        fontSize: 28,
        fontWeight: FontWeight.w500,
        color: primary,
      ),
      headlineSmall: GoogleFonts.poppins(
        fontSize: 24,
        fontWeight: FontWeight.w500,
        color: primary,
      ),
      titleLarge: GoogleFonts.poppins(
        fontSize: 20,
        fontWeight: FontWeight.w500,
        color: primary,
      ),
      titleMedium: GoogleFonts.poppins(
        fontSize: 16,
        fontWeight: FontWeight.w500,
        color: primary,
      ),
      titleSmall: GoogleFonts.poppins(
        fontSize: 14,
        fontWeight: FontWeight.w500,
        color: primary,
      ),
      bodyLarge: GoogleFonts.poppins(
        fontSize: 16,
        fontWeight: FontWeight.w400,
        color: primary,
      ),
      bodyMedium: GoogleFonts.poppins(
        fontSize: 15,
        fontWeight: FontWeight.w400,
        color: secondary,
      ),
      bodySmall: GoogleFonts.poppins(
        fontSize: 13,
        fontWeight: FontWeight.w400,
        color: secondary,
      ),
      labelLarge: GoogleFonts.poppins(
        fontSize: 14,
        fontWeight: FontWeight.w500,
        color: primary,
      ),
      labelMedium: GoogleFonts.poppins(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        color: secondary,
      ),
      labelSmall: GoogleFonts.poppins(
        fontSize: 11,
        fontWeight: FontWeight.w500,
        color: secondary,
      ),
    );
  }

  static InputDecorationTheme _buildInputTheme({
    required Color fillColor,
    required Color borderColor,
    required Color focusColor,
    required Color textColor,
    required Color hintColor,
  }) {
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: borderColor, width: 1),
    );

    final focusedBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(
        color: focusColor,
        width: 1.5,
      ),
    );

    return InputDecorationTheme(
      filled: true,
      fillColor: fillColor,
      border: border,
      enabledBorder: border,
      focusedBorder: focusedBorder,
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(
          color: AppColors.error,
          width: 1.2,
        ),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(
          color: AppColors.error,
          width: 1.5,
        ),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      hintStyle: GoogleFonts.poppins(
        color: hintColor,
        fontSize: 15,
      ),
      labelStyle: GoogleFonts.poppins(
        color: hintColor,
        fontSize: 15,
      ),
      floatingLabelStyle: GoogleFonts.poppins(
        color: AppColors.teledriveBlueText,
        fontSize: 15,
        fontWeight: FontWeight.w500,
      ),
    );
  }

  static ElevatedButtonThemeData _buildElevatedButtonTheme() {
    return ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.teledriveBlue,
        foregroundColor: AppColors.onPrimary,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
        textStyle: GoogleFonts.poppins(
          fontSize: 15,
          fontWeight: FontWeight.w500,
        ),
        minimumSize: const Size(double.infinity, 50),
      ),
    );
  }

  static OutlinedButtonThemeData _buildOutlinedButtonTheme(
    Color borderColor,
    Color textColor,
  ) {
    return OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: textColor,
        side: BorderSide(color: borderColor),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
        textStyle: GoogleFonts.poppins(
          fontSize: 15,
          fontWeight: FontWeight.w500,
        ),
        minimumSize: const Size(double.infinity, 50),
      ),
    );
  }
}
