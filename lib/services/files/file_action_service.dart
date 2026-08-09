import 'dart:io';

import 'package:permission_handler/permission_handler.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/constants/app_constants.dart';
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
    if (file.isIncomplete) {
      throw StateError('Cannot download an incomplete file. Re-upload the original file to resume.');
    }
    final local = await repository.downloadFile(file: file, onProgress: onProgress);
    String saved;
    try {
      saved = await NativeTelegramChannel.saveToDownloads(
        sourcePath: local,
        fileName: file.name,
        mimeType: file.mimeType,
      );
    } catch (_) {
      // Android 9 and older require the legacy runtime storage permission.
      final status = await Permission.storage.request();
      if (!status.isGranted) rethrow;
      saved = await NativeTelegramChannel.saveToDownloads(
        sourcePath: local,
        fileName: file.name,
        mimeType: file.mimeType,
      );
    }
    await _maybeNotifyDownload(file.name);
    return saved;
  }

  static Future<void> _maybeNotifyDownload(String name) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool(PrefKeys.transferNotifications) ?? true) {
        await NativeTelegramChannel.showNotification(
          title: 'Download complete',
          body: name,
          id: name.hashCode & 0x7fffffff,
          channelId: 'teledrive_transfers',
          channelName: 'Transfers',
        );
      }
    } catch (_) {}
  }

  static Future<void> share(
      DriveRepository repository, DriveFile file) async {
    await shareMany(repository, [file]);
  }

  static Future<void> shareMany(
      DriveRepository repository, List<DriveFile> files) async {
    for (final f in files) {
      if (f.isIncomplete) throw StateError('Cannot share incomplete file "${f.name}".');
    }
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
