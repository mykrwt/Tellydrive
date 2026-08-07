import 'package:tellybase_mobile/features/dashboard/data/datasources/dashboard_remote_data_source.dart';
import 'package:tellybase_mobile/features/dashboard/domain/entities/dashboard_summary.dart';
import 'package:tellybase_mobile/features/dashboard/domain/repositories/dashboard_repository.dart';

class DashboardRepositoryImpl implements DashboardRepository {
  const DashboardRepositoryImpl(this._remote);
  final DashboardRemoteDataSource _remote;

  @override
  Future<DashboardSummary> getSummary() async {
    final json = await _remote.getSummary();
    final recent = json['recentUpload'];
    RecentUpload? recentUpload;
    if (recent is Map<Object?, Object?>) {
      final name = recent['name'];
      final createdAt = recent['createdAt'];
      final createdLabel = recent['createdLabel'];
      if (name is String && createdAt is String && createdLabel is String) {
        recentUpload = RecentUpload(
          name: name,
          createdAt: DateTime.parse(createdAt),
          createdLabel: createdLabel,
        );
      }
    }
    return DashboardSummary(
      storageUsedBytes: _int(json['storageUsedBytes']),
      storageUsedLabel: _string(json['storageUsedLabel']),
      storagePercent: _int(json['storagePercent']),
      storageRemainingLabel: _string(json['storageRemainingLabel']),
      fileCount: _int(json['fileCount']),
      folderCount: _int(json['folderCount']),
      photoCount: _int(json['photoCount']),
      videoCount: _int(json['videoCount']),
      recentUpload: recentUpload,
      storageMode: _string(json['storageMode']),
      storageModeLabel: _string(json['storageModeLabel']),
    );
  }

  static int _int(Object? value) => value is num ? value.toInt() : 0;
  static String _string(Object? value) => value is String ? value : '';
}
