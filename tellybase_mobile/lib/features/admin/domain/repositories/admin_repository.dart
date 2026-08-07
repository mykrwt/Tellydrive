import 'package:tellybase_mobile/features/admin/domain/entities/admin_overview.dart';

abstract interface class AdminRepository {
  Future<AdminOverview> getOverview();
  Future<void> setUserRole({required String userId, required String role});
}
