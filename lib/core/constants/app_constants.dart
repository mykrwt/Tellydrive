class AppConstants {
  AppConstants._();

  static const String appName = 'TeleDrive';
  static const String appVersion = '1.2.0';
  static const String appTagline = 'Your Telegram, your cloud.';
  static const String telegramHelpUrl = 'https://my.telegram.org/auth';
  static const String telegramAppUrl = 'https://my.telegram.org';

  // File size limits. Files at or below Telegram's direct limit remain a
  // single Telegram document. Larger files use resumable hidden chunks.
  static const int telegramDirectUploadBytes = 2 * 1024 * 1024 * 1024;
  static const int telegramChunkSizeBytes = 1900 * 1024 * 1024;
  static const int maxUploadSizeBytes = telegramDirectUploadBytes;
  static const int maxUploadSizeMb = 2048;
  static const int thumbnailMaxSizeBytes = 200 * 1024;
  static const int maxUploadBatchCount = 50;
  static const int telegramHistoryScanLimit = 2000;

  // Cache
  static const int maxCacheSizeMb = 500;
  static const int defaultCacheDurationDays = 7;

  // UI
  static const double gridItemAspectRatio = 1.0;
  static const int gridCrossAxisCount = 3;
  static const double cardBorderRadius = 16.0;
  static const double itemBorderRadius = 12.0;
  static const double smallBorderRadius = 8.0;

  // Animation
  static const Duration shortAnimDuration = Duration(milliseconds: 200);
  static const Duration mediumAnimDuration = Duration(milliseconds: 350);
  static const Duration longAnimDuration = Duration(milliseconds: 500);

  // Mock data — set to false when TDLib is integrated
  static const bool useMockData = false;
}

class StorageKeys {
  StorageKeys._();

  static const String apiId = 'tg_api_id';
  static const String apiHash = 'tg_api_hash';
  static const String phone = 'tg_phone_number';         // real phone key
  static const String phoneNumber = 'tg_phone_number';   // alias
  static const String sessionString = 'tg_session_string';
  static const String isLoggedIn = 'tg_is_logged_in';
  static const String isAuthenticated = 'tg_is_authenticated';
  static const String themeMode = 'app_theme_mode';
  static const String viewMode = 'app_view_mode';
  static const String downloadPath = 'app_download_path';
  static const String cacheSize = 'app_cache_size';

  // Onboarding / permissions
  static const String onboardingCompleted = 'onboarding_completed';
}

/// SharedPreferences keys for user-controlled settings that are read directly
/// by feature code (gallery, files, backup monitor). Centralised here so the
/// keys never drift between the writer (Settings) and the readers.
class PrefKeys {
  PrefKeys._();

  // Transfer / backup behaviour
  static const String uploadsWifiOnly = 'uploads_wifi_only';
  static const String transferNotifications = 'transfer_notifications';

  // Gallery
  static const String galleryAutoplay = 'gallery_autoplay';
  static const String galleryColumns = 'gallery_columns';

  // Files
  static const String confirmBeforeDelete = 'confirm_before_delete';

  // Privacy / security
  static const String appLockEnabled = 'app_lock_enabled';

  // Gallery gesture
  static const String galleryPinchZoom = 'gallery_pinch_zoom';

  // Auto backup rules + status (mirror of AutoBackupProvider, kept in sync)
  static const String autoBackupEnabled = 'auto_backup_enabled';
  static const String autoBackupRules = 'auto_backup_rules_v2';
  static const String autoBackupWifiOnly = 'auto_backup_wifi_only';
  static const String autoBackupMobileData = 'auto_backup_mobile_data';
  static const String autoBackupChargingOnly = 'auto_backup_charging_only';
  static const String autoBackupFrequency = 'auto_backup_frequency';
  static const String autoBackupNotifications = 'auto_backup_notifications';
  static const String autoBackupLastAt = 'auto_backup_last_at';
  static const String autoBackupSeen = 'auto_backup_seen_fingerprints';
}
