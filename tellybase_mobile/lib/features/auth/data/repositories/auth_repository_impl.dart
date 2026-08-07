import 'package:tellybase_mobile/core/error/app_exception.dart';
import 'package:tellybase_mobile/core/storage/secure_session_storage.dart';
import 'package:tellybase_mobile/features/auth/data/datasources/auth_remote_data_source.dart';
import 'package:tellybase_mobile/features/auth/domain/entities/app_user.dart';
import 'package:tellybase_mobile/features/auth/domain/repositories/auth_repository.dart';

class AuthRepositoryImpl implements AuthRepository {
  const AuthRepositoryImpl(this._remote, this._sessionStorage);

  final AuthRemoteDataSource _remote;
  final SessionStorage _sessionStorage;

  @override
  Future<AppUser?> restoreSession() async {
    final cookie = await _sessionStorage.readCookie();
    if (cookie == null || cookie.isEmpty) return null;
    try {
      return (await _remote.currentSession()).toEntity();
    } on AppException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await _sessionStorage.clear();
        return null;
      }
      rethrow;
    }
  }

  @override
  Future<AppUser> signIn({
    required String email,
    required String password,
    required bool remember,
  }) async {
    await _sessionStorage.clear();
    return (await _remote.signIn(
      email: email.trim().toLowerCase(),
      password: password,
      remember: remember,
    ))
        .toEntity();
  }

  @override
  Future<void> signOut() async {
    try {
      await _remote.signOut();
    } finally {
      await _sessionStorage.clear();
    }
  }

  @override
  Future<AppUser> signUp({
    required String name,
    required String email,
    required String password,
    required String confirmPassword,
  }) async {
    await _sessionStorage.clear();
    return (await _remote.signUp(
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: password,
      confirmPassword: confirmPassword,
    ))
        .toEntity();
  }
}
