/// Application-level configuration.
///
/// The Telegram **api id** and **api hash** are required to speak MTProto.
/// Get them from https://my.telegram.org. Do NOT commit production values —
/// keep them in an environment-appropriate secret store and inject them here.
class AppConfig {
  const AppConfig._();

  static const String appName = 'TellyBase';

  /// Telegram application id (from https://my.telegram.org).
  static const int telegramApiId = 0; // TODO: set your api id

  /// Telegram application hash (from https://my.telegram.org).
  static const String telegramApiHash = ''; // TODO: set your api hash

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
