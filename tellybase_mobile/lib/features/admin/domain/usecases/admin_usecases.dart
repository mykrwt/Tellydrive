import 'package:tellybase_mobile/features/admin/domain/entities/admin_overview.dart';
import 'package:tellybase_mobile/features/admin/domain/repositories/admin_repository.dart';

class GetAdminOverview {
  const GetAdminOverview(this._repository);
  final AdminRepository _repository;
  Future<AdminOverview> call() => _repository.getOverview();
}

class SetUserRole {
  const SetUserRole(this._repository);
  final AdminRepository _repository;
  Future<void> call({required String userId, required String role}) =>
      _repository.setUserRole(userId: userId, role: role);
}
