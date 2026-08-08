/// Application-level configuration.
///
/// Telegram requires a unique `api_id` / `api_hash` pair for every client
/// application. These values are supplied at build time so a credential cannot
/// accidentally be committed to the repository or silently fall back to a
/// revoked/published key.
///
/// See `telegram_api.json.example` and the Running section of the README for
/// the supported `--dart-define` and `--dart-define-from-file` build commands.
class AppConfig {
  AppConfig._();

  static const String appName = 'TellyBase';

  /// Telegram application id from https://my.telegram.org/apps.
  ///
  /// `0` is deliberately an invalid default: shipping a made-up or shared
  /// credential causes Telegram to reject logins with API_ID_INVALID or
  /// API_ID_PUBLISHED_FLOOD, which is indistinguishable from a broken login to
  /// someone using the app.
  static const int telegramApiId =
      int.fromEnvironment('TELEGRAM_API_ID', defaultValue: 0);

  /// Telegram application hash from https://my.telegram.org/apps.
  static const String telegramApiHash =
      String.fromEnvironment('TELEGRAM_API_HASH', defaultValue: '');

  static final RegExp _apiHashPattern = RegExp(r'^[a-fA-F0-9]{32}$');

  /// Whether the build contains values with Telegram's expected basic shape.
  ///
  /// Telegram still verifies that the two values belong to the same registered
  /// application when `auth.sendCode` is called.
  static bool get hasTelegramCredentials =>
      areTelegramCredentialsWellFormed(
        apiId: telegramApiId,
        apiHash: telegramApiHash,
      );

  static bool areTelegramCredentialsWellFormed({
    required int apiId,
    required String apiHash,
  }) =>
      apiId > 0 && _apiHashPattern.hasMatch(apiHash);

  /// An actionable explanation for an unconfigured/malformed development
  /// build. This is safe to show in the app; it never includes the hash.
  static String? get telegramCredentialsIssue {
    if (telegramApiId <= 0 && telegramApiHash.trim().isEmpty) {
      return 'This build does not include Telegram API credentials.';
    }
    if (telegramApiId <= 0) {
      return 'This build has an invalid Telegram API ID.';
    }
    if (!_apiHashPattern.hasMatch(telegramApiHash)) {
      return 'This build has an invalid Telegram API hash format.';
    }
    return null;
  }

  /// Default chunk size for large files (bytes). Kept well below Telegram's
  /// 2 GiB document cap so a single chunk never overflows the protocol limit.
  static const int chunkSize = 512 * 1024 * 1024; // 512 MiB

  /// Telegram document hard limit (2 GiB).
  static const int telegramDocumentMaxSize = 2000 * 1024 * 1024;

  /// Cap on how many chunks a single logical file may use.
  static const int maxChunksPerFile = 256;

  /// Marker key used in captions so the indexer only looks at our messages.
  static const String metadataMarker = '__tellybase';

  /// Metadata schema version written into every record.
  static const int metadataVersion = 1;
}
