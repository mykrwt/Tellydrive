import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tellybase_mobile/core/di/providers.dart';
import 'package:tellybase_mobile/features/auth/domain/entities/app_user.dart';

final authControllerProvider =
    AsyncNotifierProvider<AuthController, AppUser?>(AuthController.new);

class AuthController extends AsyncNotifier<AppUser?> {
  @override
  Future<AppUser?> build() => ref.read(restoreSessionProvider)();

  Future<void> retrySession() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => ref.read(restoreSessionProvider)());
  }

  Future<bool> signIn({
    required String email,
    required String password,
    required bool remember,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(signInProvider)(
            email: email,
            password: password,
            remember: remember,
          ),
    );
    return state.hasValue && state.value != null;
  }

  Future<void> signOut() async {
    final previous = state.valueOrNull;
    state = const AsyncLoading();
    try {
      await ref.read(signOutProvider)();
      state = const AsyncData(null);
    } catch (error, stackTrace) {
      state = AsyncError(error, stackTrace);
      await Future<void>.delayed(const Duration(seconds: 2));
      if (state.hasError) state = AsyncData(previous);
    }
  }

  Future<bool> signUp({
    required String name,
    required String email,
    required String password,
    required String confirmPassword,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(signUpProvider)(
            name: name,
            email: email,
            password: password,
            confirmPassword: confirmPassword,
          ),
    );
    return state.hasValue && state.value != null;
  }
}
