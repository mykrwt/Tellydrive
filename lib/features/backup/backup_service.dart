import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:photo_manager/photo_manager.dart';

import '../../core/di/providers.dart';
import '../auth/presentation/auth_state.dart';
import '../library/presentation/library_controller.dart';
import 'backup_preferences.dart';

/// Scans the device gallery and uploads any photo/video not yet backed up,
/// always at original quality (photo_manager returns the original bytes).
class BackupService {
  const BackupService(this._ref);

  final Ref _ref;

  Future<int> backupOnce() async {
    final auth = _ref.read(authControllerProvider);
    if (auth is! AuthAuthenticated) return 0;
    final userId = auth.session.userId;

    final prefs = await _prefs();
    final uploaded = prefs.uploadedAssetIds(userId);

    final library = _ref.read(libraryControllerProvider.notifier);
    final inLibrary = <String>{
      for (final item in _ref.read(libraryControllerProvider).value ?? const [])
        item.fileName,
    };

    final permission = await PhotoManager.requestPermissionExtend();
    if (!permission.hasAccess) return 0;

    final paths = await PhotoManager.getAssetPathList(
      type: RequestType.image | RequestType.video,
      onlyAll: true,
    );
    if (paths.isEmpty) return 0;

    var backedUp = 0;
    for (final path in paths) {
      final total = path.assetCount;
      var page = 0;
      const pageSize = 50;
      var fetched = 0;

      while (fetched < total) {
        final assets = await path.getAssetListPaged(page, pageSize);
        if (assets.isEmpty) break;

        for (final asset in assets) {
          fetched++;
          if (uploaded.contains(asset.id)) continue;

          final file = await _originalFile(asset);
          if (file == null || !await file.exists()) continue;

          final size = await file.length();
          final name = asset.title ?? p.basename(file.path);
          if (inLibrary.contains(name)) {
            // Already backed up under the same original name → remember it.
            await prefs.markUploaded(userId, asset.id);
            continue;
          }

          try {
            await library.addFile(
              file.path,
              capturedAt: asset.createDateTime,
            );
            await prefs.markUploaded(userId, asset.id);
            backedUp++;
          } on Object {
            // A single failed upload must not abort the whole backup run.
          }
        }
        page++;
      }
    }
    return backedUp;
  }

  Future<BackupPreferences> _prefs() async {
    final sp = await _ref.read(preferencesProvider.future);
    return BackupPreferences(sp);
  }

  Future<File?> _originalFile(AssetEntity asset) async {
    try {
      return await asset.originalFile;
    } on Object {
      try {
        return await asset.file;
      } on Object {
        return null;
      }
    }
  }
}
