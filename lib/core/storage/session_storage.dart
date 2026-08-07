import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../error/app_exception.dart';

/// Persists the MTProto session/auth key so the user doesn't re-authenticate
/// on every launch. Backed by the OS keychain/keystore.
abstract interface class SessionStorage {
  Future<String?> read();
  Future<void> write(String value);
  Future<void> clear();
}

/// [SessionStorage] built on `flutter_secure_storage`.
class SecureSessionStorage implements SessionStorage {
  SecureSessionStorage()
      : _storage = const FlutterSecureStorage(
          aOptions: AndroidOptions(encryptedSharedPreferences: true),
        );

  static const String _key = 'tellybase.telegram.session';
  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() => _storage.read(key: _key);

  @override
  Future<void> write(String value) => _storage.write(key: _key, value: value);

  @override
  Future<void> clear() async {
    try {
      await _storage.delete(key: _key);
    } on Object catch (e) {
      throw LocalStorageException('Could not clear the session.', cause: e);
    }
  }
}
