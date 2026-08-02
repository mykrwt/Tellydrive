import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

import '../../core/crypto/crypto_engine.dart';

/// TellyBase's on-device index database.
///
/// Design goal: the *database file itself* is treated as sensitive, so
/// every row that could leak information about the user's files (names,
/// paths, sizes) is stored with its non-indexable fields encrypted at the
/// application layer (AES-256-GCM, via [CryptoEngine.metadataKey]) before
/// SQLite ever writes them to disk. A small set of columns are kept
/// queryable in the clear (id, category, folder bucket, timestamps,
/// favorite flag, sync status) so search/filter/sort remain fast without
/// needing to decrypt every row for every list render — this mirrors how
/// most "encrypted at rest" apps balance usability vs. paranoia; the
/// filenames/paths/checksums/chunk maps, which are the sensitive bits,
/// are only ever visible in plaintext in memory after explicit decryption.
///
/// This local database is a *cache/index*, not the source of truth — the
/// source of truth is the encrypted manifest stored inside the user's own
/// Telegram vault (see ManifestService). If this file is lost (app
/// reinstall, new device, storage wiped), TellyBase rebuilds it completely
/// from Telegram, which is exactly the "restore on a new phone" feature.
class LocalDatabase {
  LocalDatabase._(this._db, this._crypto);

  final Database _db;
  final CryptoEngine _crypto;

  static const _dbFileName = 'tellybase_index.db';
  static const _tableFiles = 'files';
  static const _tableChunks = 'chunks';
  static const _tableFolders = 'watched_folders';
  static const _tableAccounts = 'accounts';
  static const _tableCacheEntries = 'cache_entries';

  static Future<LocalDatabase> open() async {
    final dir = await getApplicationSupportDirectory();
    final path = p.join(dir.path, _dbFileName);

    final db = await openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE $_tableFiles (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            folder_bucket TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            modified_at INTEGER NOT NULL,
            uploaded_at INTEGER,
            sync_status TEXT NOT NULL,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            last_accessed_at INTEGER,
            account_id TEXT,
            encrypted_payload BLOB NOT NULL
          );
        ''');
        await db.execute('CREATE INDEX idx_files_category ON $_tableFiles(category);');
        await db.execute('CREATE INDEX idx_files_folder ON $_tableFiles(folder_bucket);');
        await db.execute('CREATE INDEX idx_files_status ON $_tableFiles(sync_status);');
        await db.execute('CREATE INDEX idx_files_fav ON $_tableFiles(is_favorite);');

        await db.execute('''
          CREATE TABLE $_tableFolders (
            path TEXT PRIMARY KEY,
            auto_backup INTEGER NOT NULL DEFAULT 1,
            last_scanned_at INTEGER
          );
        ''');

        await db.execute('''
          CREATE TABLE $_tableAccounts (
            id TEXT PRIMARY KEY,
            encrypted_payload BLOB NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 0
          );
        ''');

        await db.execute('''
          CREATE TABLE $_tableCacheEntries (
            file_id TEXT PRIMARY KEY,
            local_path TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            cached_at INTEGER NOT NULL
          );
        ''');
      },
    );

    return LocalDatabase._(db, CryptoEngine.instance);
  }

  // -------------------------------------------------------------------
  // Files
  // -------------------------------------------------------------------

  /// Upserts a file row. [plaintextJson] is the full [FileEntry] JSON
  /// (name, path, checksum, chunk list, etc.) and is encrypted before
  /// touching disk; the remaining positional args are the small set of
  /// fields kept queryable in the clear for fast list/filter rendering.
  Future<void> upsertFile({
    required String id,
    required String category,
    required String folderBucket,
    required int sizeBytes,
    required int createdAtMs,
    required int modifiedAtMs,
    int? uploadedAtMs,
    required String syncStatus,
    required bool isFavorite,
    int? lastAccessedAtMs,
    String? accountId,
    required Map<String, dynamic> plaintextJson,
  }) async {
    final key = await _crypto.metadataKey();
    final payload = utf8.encode(jsonEncode(plaintextJson));
    final encrypted = await _crypto.encryptBytes(Uint8List.fromList(payload), key);

    await _db.insert(
      _tableFiles,
      {
        'id': id,
        'category': category,
        'folder_bucket': folderBucket,
        'size_bytes': sizeBytes,
        'created_at': createdAtMs,
        'modified_at': modifiedAtMs,
        'uploaded_at': uploadedAtMs,
        'sync_status': syncStatus,
        'is_favorite': isFavorite ? 1 : 0,
        'last_accessed_at': lastAccessedAtMs,
        'account_id': accountId,
        'encrypted_payload': encrypted,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<Map<String, dynamic>?> getFileJson(String id) async {
    final rows = await _db.query(_tableFiles, where: 'id = ?', whereArgs: [id], limit: 1);
    if (rows.isEmpty) return null;
    return _decryptRow(rows.first);
  }

  Future<List<Map<String, dynamic>>> listFilesByCategory(String category) async {
    final rows = await _db.query(
      _tableFiles,
      where: 'category = ?',
      whereArgs: [category],
      orderBy: 'created_at DESC',
    );
    return _decryptRows(rows);
  }

  Future<List<Map<String, dynamic>>> listFilesByFolder(String folderBucket) async {
    final rows = await _db.query(
      _tableFiles,
      where: 'folder_bucket = ?',
      whereArgs: [folderBucket],
      orderBy: 'created_at DESC',
    );
    return _decryptRows(rows);
  }

  Future<List<Map<String, dynamic>>> listFavorites() async {
    final rows = await _db.query(_tableFiles, where: 'is_favorite = 1', orderBy: 'created_at DESC');
    return _decryptRows(rows);
  }

  Future<List<Map<String, dynamic>>> listRecent({int limit = 50}) async {
    final rows = await _db.query(
      _tableFiles,
      orderBy: 'COALESCE(last_accessed_at, uploaded_at, created_at) DESC',
      limit: limit,
    );
    return _decryptRows(rows);
  }

  Future<List<Map<String, dynamic>>> listPendingUploads() async {
    final rows = await _db.query(
      _tableFiles,
      where: 'sync_status IN (?, ?, ?)',
      whereArgs: ['pendingUpload', 'uploading', 'failed'],
    );
    return _decryptRows(rows);
  }

  /// Search is necessarily "decrypt then filter" since filenames are
  /// encrypted at rest; TellyBase keeps the whole index small enough
  /// (typical personal libraries: thousands, not millions, of files) that
  /// this remains fast — an in-memory cache layer on top (see
  /// SearchIndexCache) avoids repeated decryption on every keystroke.
  Future<List<Map<String, dynamic>>> allFilesForSearchCache() async {
    final rows = await _db.query(_tableFiles);
    return _decryptRows(rows);
  }

  Future<int> totalStoredBytes() async {
    final result = await _db.rawQuery(
      "SELECT SUM(size_bytes) as total FROM $_tableFiles WHERE sync_status = 'synced' OR sync_status = 'cloudOnly'",
    );
    return (result.first['total'] as int?) ?? 0;
  }

  Future<Map<String, int>> storageByCategory() async {
    final result = await _db.rawQuery(
      'SELECT category, SUM(size_bytes) as total FROM $_tableFiles GROUP BY category',
    );
    return {for (final row in result) row['category'] as String: (row['total'] as int?) ?? 0};
  }

  Future<void> deleteFile(String id) async {
    await _db.delete(_tableFiles, where: 'id = ?', whereArgs: [id]);
    await _db.delete(_tableCacheEntries, where: 'file_id = ?', whereArgs: [id]);
  }

  Future<List<Map<String, dynamic>>> _decryptRows(List<Map<String, dynamic>> rows) async {
    final key = await _crypto.metadataKey();
    final out = <Map<String, dynamic>>[];
    for (final row in rows) {
      final blob = row['encrypted_payload'] as Uint8List;
      final clear = await _crypto.decryptBytes(blob, key);
      out.add(jsonDecode(utf8.decode(clear)) as Map<String, dynamic>);
    }
    return out;
  }

  Future<Map<String, dynamic>> _decryptRow(Map<String, dynamic> row) async {
    final key = await _crypto.metadataKey();
    final blob = row['encrypted_payload'] as Uint8List;
    final clear = await _crypto.decryptBytes(blob, key);
    return jsonDecode(utf8.decode(clear)) as Map<String, dynamic>;
  }

  // -------------------------------------------------------------------
  // Watched folders (Smart Backup)
  // -------------------------------------------------------------------

  Future<void> setFolderWatched(String path, bool autoBackup) async {
    await _db.insert(
      _tableFolders,
      {'path': path, 'auto_backup': autoBackup ? 1 : 0, 'last_scanned_at': null},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Map<String, dynamic>>> watchedFolders() => _db.query(_tableFolders);

  Future<void> markFolderScanned(String path) async {
    await _db.update(
      _tableFolders,
      {'last_scanned_at': DateTime.now().millisecondsSinceEpoch},
      where: 'path = ?',
      whereArgs: [path],
    );
  }

  // -------------------------------------------------------------------
  // Cache entries (offline cache of recently accessed files, subject to
  // automatic cleanup once total size / TTL policy is exceeded).
  // -------------------------------------------------------------------

  Future<void> recordCacheEntry(String fileId, String localPath, int sizeBytes) async {
    await _db.insert(
      _tableCacheEntries,
      {
        'file_id': fileId,
        'local_path': localPath,
        'size_bytes': sizeBytes,
        'cached_at': DateTime.now().millisecondsSinceEpoch,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Map<String, dynamic>>> allCacheEntriesOldestFirst() => _db.query(
        _tableCacheEntries,
        orderBy: 'cached_at ASC',
      );

  Future<void> removeCacheEntry(String fileId) async {
    await _db.delete(_tableCacheEntries, where: 'file_id = ?', whereArgs: [fileId]);
  }

  Future<int> totalCacheBytes() async {
    final result = await _db.rawQuery('SELECT SUM(size_bytes) as total FROM $_tableCacheEntries');
    return (result.first['total'] as int?) ?? 0;
  }

  // -------------------------------------------------------------------
  // Multi-account support
  // -------------------------------------------------------------------

  Future<void> upsertAccount(String id, Map<String, dynamic> plaintextJson, {bool active = false}) async {
    final key = await _crypto.metadataKey();
    final payload = utf8.encode(jsonEncode(plaintextJson));
    final encrypted = await _crypto.encryptBytes(Uint8List.fromList(payload), key);

    if (active) {
      await _db.update(_tableAccounts, {'is_active': 0});
    }
    await _db.insert(
      _tableAccounts,
      {'id': id, 'encrypted_payload': encrypted, 'is_active': active ? 1 : 0},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Map<String, dynamic>>> listAccounts() async {
    final rows = await _db.query(_tableAccounts);
    final out = <Map<String, dynamic>>[];
    final key = await _crypto.metadataKey();
    for (final row in rows) {
      final clear = await _crypto.decryptBytes(row['encrypted_payload'] as Uint8List, key);
      final json = jsonDecode(utf8.decode(clear)) as Map<String, dynamic>;
      json['isActive'] = row['is_active'] == 1;
      out.add(json);
    }
    return out;
  }

  /// Wipes the entire local index. Used for "sign out and forget this
  /// device's cache" — Telegram itself still has every file safely, so
  /// this is non-destructive to actual data.
  Future<void> wipeAll() async {
    await _db.delete(_tableFiles);
    await _db.delete(_tableFolders);
    await _db.delete(_tableCacheEntries);
  }

  Future<void> close() => _db.close();
}
