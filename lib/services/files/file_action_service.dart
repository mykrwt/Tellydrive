import 'dart:io';

import 'package:permission_handler/permission_handler.dart';
import 'package:share_plus/share_plus.dart';

import '../../features/drive/domain/entities/drive_file.dart';
import '../../features/drive/domain/repositories/drive_repository.dart';
import '../platform/native_telegram_channel.dart';

class FileActionService {
  const FileActionService._();

  static Future<String> downloadToDevice(
    DriveRepository repository,
    DriveFile file, {
    void Function(double progress)? onProgress,
  }) async {
    final local = await repository.downloadFile(file: file, onProgress: onProgress);
    try {
      return await NativeTelegramChannel.saveToDownloads(
        sourcePath: local,
        fileName: file.name,
        mimeType: file.mimeType,
      );
    } catch (_) {
      // Android 9 and older require the legacy runtime storage permission.
      final status = await Permission.storage.request();
      if (!status.isGranted) rethrow;
      return NativeTelegramChannel.saveToDownloads(
        sourcePath: local,
        fileName: file.name,
        mimeType: file.mimeType,
      );
    }
  }

  static Future<void> share(
      DriveRepository repository, DriveFile file) async {
    await shareMany(repository, [file]);
  }

  static Future<void> shareMany(
      DriveRepository repository, List<DriveFile> files) async {
    final localFiles = <XFile>[];
    for (final file in files) {
      var path = file.localPath;
      if (path == null || path.isEmpty || !await File(path).exists()) {
        path = await repository.downloadFile(file: file);
      }
      localFiles.add(XFile(path));
    }
    await SharePlus.instance.share(ShareParams(
      files: localFiles,
      text: files.length == 1 ? files.first.name : null,
    ));
  }
}
