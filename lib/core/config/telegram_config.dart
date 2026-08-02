/// Telegram MTProto application credentials.
///
/// TellyBase talks to Telegram exactly the way the official Telegram apps
/// do: it authenticates the *user's own account* via MTProto (phone number
/// + login code, optionally + 2FA cloud password) and then uses that same
/// session to upload/download files. There is no bot, no bot token and no
/// TellyBase-operated server anywhere in this flow.
///
/// MTProto requires every client application (official or third-party) to
/// identify itself with an `api_id` / `api_hash` pair issued by Telegram at
/// https://my.telegram.org. Telegram Desktop's own open-source repository
/// ships a small set of *public test-only* credentials for exactly this
/// "get something running immediately" situation:
/// https://github.com/telegramdesktop/tdesktop/blob/dev/docs/api_credentials.md
///
/// TellyBase ships those test credentials as the default so the app works
/// out of the box with zero setup. They are intentionally rate-limited by
/// Telegram and are **not** suitable for a real production release — if you
/// intend to ship TellyBase to real users, get your own free api_id/api_hash
/// from https://my.telegram.org/apps (takes ~2 minutes) and drop it in
/// below, or override via `--dart-define` at build time so you never commit
/// personal credentials to git.
class TelegramConfig {
  const TelegramConfig._();

  /// Public TEST-ONLY credentials published by Telegram Desktop. Safe to
  /// ship as a default, but heavily rate-limited — swap in your own from
  /// my.telegram.org for anything beyond personal/dev use.
  static const int _testApiId = 17349;
  static const String _testApiHash = '344583e45741c457fe1862106095a5eb';

  /// Reads `API_ID` / `API_HASH` supplied at build time
  /// (`flutter build ... --dart-define=API_ID=... --dart-define=API_HASH=...`)
  /// and falls back to the public test credentials above when absent.
  static const int apiId = int.fromEnvironment('API_ID', defaultValue: _testApiId);
  static const String apiHash = String.fromEnvironment('API_HASH', defaultValue: _testApiHash);

  /// Identifies TellyBase to Telegram's servers (shown to the user under
  /// Settings > Devices in the real Telegram app, same as any other client).
  static const String appVersion = '1.0.0';
  static const String deviceModelFallback = 'TellyBase Client';
  static const String systemVersionFallback = 'Unknown';
  static const String langCode = 'en';
  static const String systemLangCode = 'en-US';
  static const String langPack = '';

  /// Default MTProto data center to bootstrap the very first connection
  /// with (production, DC2, Amsterdam). The client will follow Telegram's
  /// own redirects (`PHONE_MIGRATE_x` / `NETWORK_MIGRATE_x`) to the DC that
  /// actually owns the user's account, exactly like official clients do.
  static const String defaultDcIp = '149.154.167.51';
  static const int defaultDcPort = 443;
  static const int defaultDcId = 2;

  /// Name TellyBase gives the private channel it creates on first login to
  /// use as the user's "vault" (their own encrypted personal cloud, still
  /// 100% inside their own Telegram account). Users may rename it freely in
  /// Telegram itself; TellyBase re-discovers it by the pinned root manifest
  /// message, not by title.
  static const String defaultVaultTitle = 'TellyBase Cloud';
  static const String defaultVaultAbout =
      'Encrypted personal storage created by TellyBase. Do not delete this '
      'chat or its pinned message — it is the only index of your backups.';
}
