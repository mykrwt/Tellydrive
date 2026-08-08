/// Application-level configuration.
///
/// The Telegram **api id** and **api hash** are required to speak MTProto.
/// Get them from https://my.telegram.org. The values below are the app
/// owner's personal pair, so local `flutter run` builds work out of the box.
/// For CI/release builds, override them with
/// `--dart-define=TELEGRAM_API_ID=…` and `--dart-define=TELEGRAM_API_HASH=…`
/// (see the Codemagic workflow). If this repo ever goes public, revoke these
/// keys at my.telegram.org and switch to injection-only.
class AppConfig {
  AppConfig._();

  static const String appName = 'TellyBase';

  /// Telegram application id (from https://my.telegram.org).
  static const int telegramApiId =
      int.fromEnvironment('TELEGRAM_API_ID', defaultValue: 37486449);

  /// Telegram application hash (from https://my.telegram.org).
  static const String telegramApiHash =
      String.fromEnvironment('TELEGRAM_API_HASH', defaultValue: '007a576cd080b8b894de719d0214dffd');

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
