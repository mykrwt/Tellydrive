import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tellybase_mobile/core/di/providers.dart';
import 'package:tellybase_mobile/features/admin/domain/entities/admin_overview.dart';

final adminControllerProvider =
    AsyncNotifierProvider.autoDispose<AdminController, AdminOverview>(AdminController.new);

class AdminController extends AutoDisposeAsyncNotifier<AdminOverview> {
  @override
  Future<AdminOverview> build() => ref.read(getAdminOverviewProvider)();

  Future<void> refresh() async {
    state = const AsyncLoading<AdminOverview>().copyWithPrevious(state);
    state = await AsyncValue.guard(() => ref.read(getAdminOverviewProvider)());
  }

  Future<void> setRole(AdminUser user, String role) async {
    final current = state.valueOrNull;
    if (current == null || user.role == role) return;
    state = const AsyncLoading<AdminOverview>().copyWithPrevious(state);
    try {
      await ref.read(setUserRoleProvider)(userId: user.id, role: role);
      state = AsyncData(await ref.read(getAdminOverviewProvider)());
    } catch (error, stackTrace) {
      state = AsyncError<AdminOverview>(error, stackTrace).copyWithPrevious(
        AsyncData(current),
      );
    }
  }
}
