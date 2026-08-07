import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:path/path.dart' as p;
import 'package:photo_manager/photo_manager.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import 'package:workmanager/workmanager.dart';

import '../../core/config/app_config.dart';
import '../../core/storage/session_storage.dart';
import '../../features/library/domain/entities/media_item.dart';
import '../../telegram/mtproto/mtproto_storage.dart';
import '../../telegram/mtproto/mtproto_transport.dart';
import 'backup_preferences.dart';

/// Registers and drives periodic background backups via Android WorkManager.
///
/// The heavy MTProto + gallery pipeline runs on the app's main isolate; this
/// scheduler additionally registers a periodic task whose callback re-reads the
/// secure session and uploads any gallery items that were missed while the app
/// was closed. Exact behaviour depends on the device's background-work policy.
class BackupScheduler {
  BackupScheduler._();

  static const String _taskName = 'tellybase-backup';
  static const String _taskTag = 'tellybase-backup-task';

  static Future<void> ensureInitialised() async {
    await Workmanager().initialize(callbackDispatcher);
  }

  static Future<void> schedule() async {
    await Workmanager().registerPeriodicTask(
      _taskName,
      _taskTag,
      frequency: const Duration(hours: 6),
      constraints: Constraints(networkType: NetworkType.connected),
      existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
    );
  }

  static Future<void> cancel() async {
    await Workmanager().cancelByUniqueName(_taskName);
  }
}

/// Entry point executed by WorkManager on its background isolate.
@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    WidgetsFlutterBinding.ensureInitialized();
    try {
      return await BackgroundBackup.run();
    } on Object {
      return false;
    }
  });
}

/// Minimal background pipeline that avoids the Riverpod graph entirely: reads
/// the secure session, uploads gallery items that aren't backed up yet.
class BackgroundBackup {
  static Future<bool> run() async {
    final storage = SecureSessionStorage();
    final session = await storage.read();
    if (session == null || session.isEmpty) return false;

    final transport = MtprotoTransport(
      apiId: AppConfig.telegramApiId,
      apiHash: AppConfig.telegramApiHash,
    );
    await transport.connect(session: session);
    final userId = await transport.getMe();
    final mtproto = MtprotoStorage(transport: transport, userId: userId);

    final prefs = await SharedPreferences.getInstance();
    final backupPrefs = BackupPreferences(prefs);
    if (!backupPrefs.enabled) {
      await transport.disconnect();
      return false;
    }
    final uploaded = backupPrefs.uploadedAssetIds(userId);

    final permission = await PhotoManager.requestPermissionExtend();
    if (!permission.hasAccess) {
      await transport.disconnect();
      return false;
    }

    final paths = await PhotoManager.getAssetPathList(
      type: RequestType.image | RequestType.video,
      onlyAll: true,
    );
    var done = 0;
    for (final path in paths) {
      final count = await path.assetCountAsync;
      final assets = await path.getAssetListPaged(page: 0, size: count);
      for (final asset in assets) {
        if (uploaded.contains(asset.id)) continue;
        final file = await _original(asset);
        if (file == null || !await file.exists()) continue;

        final size = await file.length();
        final name = asset.title ?? p.basename(file.path);
        try {
          final item = MediaItem(
            id: _uuid.v4(),
            fileName: name,
            mimeType: _mimeFor(name),
            size: size,
            uploadedAt: DateTime.now(),
            capturedAt: asset.createDateTime,
            chunkMessageIds: const [],
            firstMessageId: 0,
          );
          await mtproto.uploadItem(item: item, localFilePath: file.path);
          await backupPrefs.markUploaded(userId, asset.id);
          done++;
        } on Object {
          // keep going
        }
      }
    }

    await transport.disconnect();
    return done > 0;
  }

  static final _uuid = Uuid();

  static Future<File?> _original(AssetEntity asset) async {
    try {
      // photo_manager 3.x uses originFile (nullable File?)
      return await asset.originFile;
    } on Object {
      try {
        return await asset.file;
      } on Object {
        return null;
      }
    }
  }

  static String _mimeFor(String fileName) {
    final ext = p.extension(fileName).toLowerCase();
    const map = <String, String>{
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic',
      '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
    };
    return map[ext] ?? 'application/octet-stream';
  }
}
