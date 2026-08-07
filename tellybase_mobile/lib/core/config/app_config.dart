abstract final class AppConfig {
  static const String appName = 'TellyBase';
  static const int pageSize = 48;
  static const int uploadPartBytes = 4 * 1024 * 1024;
  static const int maxUploadBytes = 2 * 1024 * 1024 * 1024;

  static const String _configuredBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  static String get apiBaseUrl =>
      _configuredBaseUrl.replaceFirst(RegExp(r'/+$'), '');

  static Uri resolveUri(String path) {
    final normalized = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$apiBaseUrl$normalized');
  }
}
