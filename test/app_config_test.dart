import 'package:flutter_test/flutter_test.dart';
import 'package:tellybase/core/config/app_config.dart';

void main() {
  group('Telegram build credential validation', () {
    test('accepts a positive id and a 32-character hexadecimal hash', () {
      expect(
        AppConfig.areTelegramCredentialsWellFormed(
          apiId: 12345678,
          apiHash: '0123456789abcdef0123456789ABCDEF',
        ),
        isTrue,
      );
    });

    test('rejects a missing id', () {
      expect(
        AppConfig.areTelegramCredentialsWellFormed(
          apiId: 0,
          apiHash: '0123456789abcdef0123456789abcdef',
        ),
        isFalse,
      );
    });

    test('rejects malformed hashes before attempting a login', () {
      expect(
        AppConfig.areTelegramCredentialsWellFormed(
          apiId: 12345678,
          apiHash: 'not-a-telegram-hash',
        ),
        isFalse,
      );
    });
  });
}
