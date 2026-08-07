import 'package:tellybase_mobile/features/storage/domain/entities/cloud_folder.dart';

class CloudFolderModel {
  const CloudFolderModel(this.folder);

  factory CloudFolderModel.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final name = json['name'];
    final createdAt = json['createdAt'];
    if (id is! String || name is! String || createdAt is! String) {
      throw const FormatException('Invalid folder response');
    }
    return CloudFolderModel(
      CloudFolder(
        id: id,
        name: name,
        parentId: json['parentId'] is String ? json['parentId'] as String : null,
        createdAt: DateTime.parse(createdAt),
        itemCount: json['itemCount'] is num
            ? (json['itemCount'] as num).toInt()
            : 0,
      ),
    );
  }

  final CloudFolder folder;
  CloudFolder toEntity() => folder;
}
