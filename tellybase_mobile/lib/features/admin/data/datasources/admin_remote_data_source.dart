import 'package:tellybase_mobile/core/error/app_exception.dart';
import 'package:tellybase_mobile/core/network/api_client.dart';
import 'package:tellybase_mobile/features/admin/data/models/admin_overview_model.dart';

class AdminRemoteDataSource {
  const AdminRemoteDataSource(this._client);
  final ApiClient _client;

  Future<AdminOverviewModel> getOverview() async {
    final json = await _client.getJson('/api/mobile/v1/admin');
    final value = json['overview'];
    if (value is Map<String, dynamic>) return AdminOverviewModel.fromJson(value);
    if (value is Map<Object?, Object?>) {
      return AdminOverviewModel.fromJson(
        value.map((key, entry) => MapEntry(key.toString(), entry)),
      );
    }
    throw const AppException('The admin overview is invalid.');
  }

  Future<void> setUserRole({required String userId, required String role}) async {
    await _client.patchJson(
      '/api/mobile/v1/admin/users/${Uri.encodeComponent(userId)}',
      data: <String, Object>{'role': role},
    );
  }
}
