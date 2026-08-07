import 'package:tellybase_mobile/core/error/app_exception.dart';
import 'package:tellybase_mobile/core/network/api_client.dart';

class DashboardRemoteDataSource {
  const DashboardRemoteDataSource(this._client);
  final ApiClient _client;

  Future<Map<String, dynamic>> getSummary() async {
    final json = await _client.getJson('/api/mobile/v1/dashboard');
    final summary = json['summary'];
    if (summary is Map<String, dynamic>) return summary;
    if (summary is Map<Object?, Object?>) {
      return summary.map((key, value) => MapEntry(key.toString(), value));
    }
    throw const AppException('The storage summary is invalid.');
  }
}
