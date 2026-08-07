import 'package:tellybase_mobile/features/auth/domain/entities/app_user.dart';

abstract interface class AuthRepository {
  Future<AppUser?> restoreSession();
  Future<AppUser> signIn({
    required String email,
    required String password,
    required bool remember,
  });
  Future<void> signOut();
  Future<AppUser> signUp({
    required String name,
    required String email,
    required String password,
    required String confirmPassword,
  });
}
