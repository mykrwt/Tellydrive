import 'package:tellybase_mobile/features/storage/domain/entities/cloud_file.dart';

class CloudFileModel {
  const CloudFileModel(this.file);

  factory CloudFileModel.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final name = json['name'];
    final mimeType = json['mimeType'];
    final createdAt = json['createdAt'];
    if (id is! String ||
        name is! String ||
        mimeType is! String ||
        createdAt is! String) {
      throw const FormatException('Invalid file response');
    }
    final updated = json['updatedAt'];
    final folder = json['folderId'];
    return CloudFileModel(
      CloudFile(
        id: id,
        name: name,
        size: json['size'] is num ? (json['size'] as num).toInt() : 0,
        mimeType: mimeType,
        createdAt: DateTime.parse(createdAt),
        updatedAt: updated is String ? DateTime.tryParse(updated) : null,
        chunked: json['chunked'] == true,
        folderId: folder is String ? folder : null,
        favorite: json['favorite'] == true,
        hasThumbnail: json['hasThumbnail'] == true,
        width: json['width'] is num ? (json['width'] as num).toDouble() : null,
        height: json['height'] is num ? (json['height'] as num).toDouble() : null,
        duration: json['duration'] is num
            ? (json['duration'] as num).toDouble()
            : null,
      ),
    );
  }

  final CloudFile file;
  CloudFile toEntity() => file;
}
