import 'package:tellybase_mobile/features/auth/domain/entities/app_user.dart';
import 'package:tellybase_mobile/features/auth/domain/repositories/auth_repository.dart';

class RestoreSession {
  const RestoreSession(this._repository);
  final AuthRepository _repository;
  Future<AppUser?> call() => _repository.restoreSession();
}

class SignIn {
  const SignIn(this._repository);
  final AuthRepository _repository;

  Future<AppUser> call({
    required String email,
    required String password,
    required bool remember,
  }) =>
      _repository.signIn(
        email: email,
        password: password,
        remember: remember,
      );
}

class SignUp {
  const SignUp(this._repository);
  final AuthRepository _repository;

  Future<AppUser> call({
    required String name,
    required String email,
    required String password,
    required String confirmPassword,
  }) =>
      _repository.signUp(
        name: name,
        email: email,
        password: password,
        confirmPassword: confirmPassword,
      );
}

class SignOut {
  const SignOut(this._repository);
  final AuthRepository _repository;
  Future<void> call() => _repository.signOut();
}
