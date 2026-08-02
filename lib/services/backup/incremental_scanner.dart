import 'dart:io';

import 'package:crypto/crypto.dart' as pkg_crypto;

import '../../data/local_db/local_database.dart';

/// Implements "incremental backups so only new or modified files are
/// uploaded": walks a watched folder, and for each file decides whether it
/// needs uploading by comparing (path, size, mtime) against the local
/// index first (cheap) and falling back to a content hash comparison only
/// when metadata alone is ambiguous (e.g. after a restore where mtimes
/// might differ from the original device).
class IncrementalScanner {
  IncrementalScanner(this._db);

  final LocalDatabase _db;

  Future<List<File>> findFilesNeedingBackup(Directory folder) async {
    if (!await folder.exists()) return [];

    final existingByPath = <String, Map<String, dynamic>>{};
    final allIndexed = await _db.allFilesForSearchCache();
    for (final f in allIndexed) {
      final localPath = f['localPath'] as String?;
      if (localPath != null) existingByPath[localPath] = f;
    }

    final needsBackup = <File>[];
    await for (final entity in folder.list(recursive: true, followLinks: false)) {
      if (entity is! File) continue;
      final stat = await entity.stat();
      final existing = existingByPath[entity.path];

      if (existing == null) {
        needsBackup.add(entity);
        continue;
      }

      final existingSize = existing['sizeBytes'] as int?;
      final existingModified = existing['modifiedAt'] as String?;
      final sizeChanged = existingSize != stat.size;
      final mtimeChanged = existingModified == null ||
          DateTime.parse(existingModified).millisecondsSinceEpoch != stat.modified.millisecondsSinceEpoch;

      if (sizeChanged || mtimeChanged) {
        // Metadata looks different — confirm with a real hash comparison
        // before re-uploading a potentially huge file for no reason (e.g.
        // some file managers touch mtime without changing content).
        final actualHash = await _quickHash(entity);
        if (actualHash != existing['sha256']) {
          needsBackup.add(entity);
        }
      }
    }
    return needsBackup;
  }

  Future<String> _quickHash(File file) async {
    final stream = file.openRead();
    final digest = await pkg_crypto.sha256.bind(stream).first;
    return digest.toString();
  }
}
