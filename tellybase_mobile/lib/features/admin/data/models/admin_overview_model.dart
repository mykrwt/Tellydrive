import 'package:tellybase_mobile/features/admin/domain/entities/admin_overview.dart';

class AdminOverviewModel {
  const AdminOverviewModel(this.overview);

  factory AdminOverviewModel.fromJson(Map<String, dynamic> json) {
    final totals = _map(json['totals']);
    final rawUsers = json['users'];
    final users = rawUsers is List<Object?>
        ? rawUsers
            .whereType<Map<Object?, Object?>>()
            .map((value) {
              final item = value.map((key, entry) => MapEntry(key.toString(), entry));
              return AdminUser(
                id: _string(item['id']),
                name: _string(item['name']),
                email: _string(item['email']),
                role: _string(item['role'], fallback: 'user'),
                createdAt: DateTime.parse(_string(item['createdAt'])),
                lastLoginAt: item['lastLoginAt'] is String
                    ? DateTime.tryParse(item['lastLoginAt'] as String)
                    : null,
                fileCount: _int(item['fileCount']),
                totalBytes: _int(item['totalBytes']),
              );
            })
            .toList(growable: false)
        : const <AdminUser>[];
    return AdminOverviewModel(
      AdminOverview(
        mode: _string(json['mode']),
        revision: _int(json['revision']),
        updatedAt: DateTime.parse(_string(json['updatedAt'])),
        totals: AdminTotals(
          users: _int(totals['users']),
          files: _int(totals['files']),
          folders: _int(totals['folders']),
          bytes: _int(totals['bytes']),
          images: _int(totals['images']),
          videos: _int(totals['videos']),
          documents: _int(totals['documents']),
        ),
        users: users,
      ),
    );
  }

  final AdminOverview overview;
  AdminOverview toEntity() => overview;

  static int _int(Object? value) => value is num ? value.toInt() : 0;
  static Map<String, dynamic> _map(Object? value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map<Object?, Object?>) {
      return value.map((key, entry) => MapEntry(key.toString(), entry));
    }
    return <String, dynamic>{};
  }

  static String _string(Object? value, {String fallback = ''}) =>
      value is String ? value : fallback;
}
