import 'package:tellybase_mobile/features/storage/domain/entities/cloud_file.dart';

class FilePage {
  const FilePage({required this.files, required this.total});
  final List<CloudFile> files;
  final int total;
  bool get hasMore => files.length < total;
}

enum MediaFilter { all, images, videos, favorites }
enum FileSort { dateNewest, dateOldest, nameAscending, sizeDescending }
