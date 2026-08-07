import 'package:tellybase_mobile/core/error/app_exception.dart';
import 'package:tellybase_mobile/core/network/api_client.dart';
import 'package:tellybase_mobile/features/auth/data/models/user_model.dart';

class AuthRemoteDataSource {
  const AuthRemoteDataSource(this._client);
  final ApiClient _client;

  Future<UserModel> currentSession() async {
    final json = await _client.getJson('/api/mobile/v1/auth/session');
    return _readUser(json);
  }

  Future<UserModel> signIn({
    required String email,
    required String password,
    required bool remember,
  }) async {
    final json = await _client.postJson(
      '/api/mobile/v1/auth/sign-in',
      data: <String, Object>{
        'email': email,
        'password': password,
        'remember': remember,
      },
    );
    return _readUser(json);
  }

  Future<void> signOut() async {
    await _client.deleteJson('/api/mobile/v1/auth/session');
  }

  Future<UserModel> signUp({
    required String name,
    required String email,
    required String password,
    required String confirmPassword,
  }) async {
    final json = await _client.postJson(
      '/api/mobile/v1/auth/sign-up',
      data: <String, Object>{
        'name': name,
        'email': email,
        'password': password,
        'confirmPassword': confirmPassword,
      },
    );
    return _readUser(json);
  }

  UserModel _readUser(Map<String, dynamic> json) {
    final value = json['user'];
    if (value is Map<String, dynamic>) return UserModel.fromJson(value);
    if (value is Map<Object?, Object?>) {
      return UserModel.fromJson(
        value.map((key, entry) => MapEntry(key.toString(), entry)),
      );
    }
    throw const AppException('The server returned an invalid account.');
  }
}
