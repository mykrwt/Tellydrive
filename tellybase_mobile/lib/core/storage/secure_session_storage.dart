import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class SessionStorage {
  Future<void> clear();
  Future<String?> readCookie();
  Future<void> writeCookie(String value);
}

class SecureSessionStorage implements SessionStorage {
  SecureSessionStorage({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              // v10 defaults to RSA-OAEP + AES-GCM on Android and migrates
              // legacy cipher data when needed.
              aOptions: AndroidOptions(),
            );

  static const _cookieKey = 'tellybase.session.cookie.v1';
  final FlutterSecureStorage _storage;

  @override
  Future<void> clear() => _storage.delete(key: _cookieKey);

  @override
  Future<String?> readCookie() => _storage.read(key: _cookieKey);

  @override
  Future<void> writeCookie(String value) =>
      _storage.write(key: _cookieKey, value: value);
}
