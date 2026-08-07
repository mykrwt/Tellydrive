import 'dart:io';

import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:tellybase_mobile/core/error/app_exception.dart';
import 'package:tellybase_mobile/core/utils/file_formatters.dart';

class DeviceFileService {
  const DeviceFileService();

  Future<String> createDownloadPath(String fileName) async {
    final root = await getApplicationDocumentsDirectory();
    final downloads = Directory('${root.path}/downloads');
    await downloads.create(recursive: true);
    final safeName = FileFormatters.safeFileName(fileName);
    final candidate = File('${downloads.path}/$safeName');
    if (!await candidate.exists()) return candidate.path;
    final dot = safeName.lastIndexOf('.');
    final stem = dot > 0 ? safeName.substring(0, dot) : safeName;
    final extension = dot > 0 ? safeName.substring(dot) : '';
    return '${downloads.path}/${stem}_${DateTime.now().millisecondsSinceEpoch}$extension';
  }

  Future<void> open(String path) async {
    final result = await OpenFilex.open(path);
    if (result.type != ResultType.done) {
      throw AppException(result.message.isEmpty ? 'No app can open this file.' : result.message);
    }
  }
}
