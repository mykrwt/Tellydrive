import 'package:tellybase_mobile/features/admin/data/datasources/admin_remote_data_source.dart';
import 'package:tellybase_mobile/features/admin/domain/entities/admin_overview.dart';
import 'package:tellybase_mobile/features/admin/domain/repositories/admin_repository.dart';

class AdminRepositoryImpl implements AdminRepository {
  const AdminRepositoryImpl(this._remote);
  final AdminRemoteDataSource _remote;

  @override
  Future<AdminOverview> getOverview() async => (await _remote.getOverview()).toEntity();

  @override
  Future<void> setUserRole({required String userId, required String role}) =>
      _remote.setUserRole(userId: userId, role: role);
}
