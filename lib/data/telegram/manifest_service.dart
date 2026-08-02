import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';

import '../../core/crypto/crypto_engine.dart';
import '../../domain/models/file_entry.dart';
import 'telegram_vault_service.dart';

/// The manifest is the single encrypted JSON document that makes TellyBase
/// "serverless": it fully describes every file the user has ever backed
/// up (name, folder, size, hash, chunk map) and lives *inside the user's
/// own Telegram vault* as a pinned message — not on any TellyBase-operated
/// infrastructure, because there isn't any.
///
/// Flow:
///   • Every local index mutation (new upload completes, file renamed,
///     favorited, deleted, etc.) schedules a debounced manifest flush.
///   • The flush serializes the *entire* current file list to JSON,
///     encrypts it with the metadata sub-key derived from the device
///     master key, uploads it as a document to the vault, and re-pins it
///     (replacing the previous pin).
///   • On a brand-new device, TellyBase signs into the same Telegram
///     account, finds the vault channel, downloads + decrypts the pinned
///     manifest, and instantly has the full file list back — no chunk
///     re-scan needed unless the manifest itself is somehow missing, in
///     which case [FileRepository.restoreFromVault] falls back to reading
///     every TellyBase-tagged message's caption directly.
///
/// The manifest never contains actual file bytes, only metadata — so even
/// though it is encrypted, its size stays tiny (a personal library of
/// 50,000 files serializes to a few MB of JSON) and is cheap to re-upload
/// after every change.
class ManifestService {
  ManifestService(this._vault, {CryptoEngine? crypto}) : _crypto = crypto ?? CryptoEngine.instance;

  final TelegramVaultService _vault;
  final CryptoEngine _crypto;

  int? _lastManifestMessageId;

  /// Encrypts and republishes the full manifest. Called by the sync engine
  /// after a debounce window so rapid successive changes (e.g. bulk
  /// import) collapse into a single upload+pin.
  Future<void> publish(List<FileEntry> allFiles, {required int schemaVersion}) async {
    final json = {
      'schemaVersion': schemaVersion,
      'generatedAt': DateTime.now().toIso8601String(),
      'fileCount': allFiles.length,
      'files': allFiles.map((f) => f.toJson()).toList(),
    };

    final key = await _crypto.metadataKey();
    final plainBytes = Uint8List.fromList(utf8.encode(jsonEncode(json)));
    final encrypted = await _crypto.encryptBytes(plainBytes, key);

    final messageId = await _vault.publishManifestBlob(
      encrypted,
      previousMessageId: _lastManifestMessageId,
    );
    _lastManifestMessageId = messageId;
  }

  /// Attempts the fast path: locate the pinned manifest message, download
  /// its document bytes, decrypt, and parse the file list. Returns null if
  /// no manifest exists yet (fresh vault / never backed up anything from
  /// any device).
  Future<List<FileEntry>?> tryFastRestore() async {
    final ref = await _vault.findPinnedManifest();
    if (ref == null) return null;

    final tempDir = await getTemporaryDirectory();
    final tempFile = File('${tempDir.path}/tellybase_manifest_download.bin');

    await _vault.downloadChunk(
      telegramFileId: ref.telegramFileId,
      telegramAccessHash: ref.telegramAccessHash,
      fileReference: ref.fileReference,
      destination: tempFile,
      totalBytes: ref.sizeBytes,
    );

    final encryptedBytes = await tempFile.readAsBytes();
    await tempFile.delete();

    final json = await decryptManifestBytes(encryptedBytes);
    final files = (json['files'] as List).cast<Map<String, dynamic>>();
    return files.map(FileEntry.fromJson).toList();
  }

  Future<Map<String, dynamic>> decryptManifestBytes(Uint8List encryptedBytes) async {
    final key = await _crypto.metadataKey();
    final clear = await _crypto.decryptBytes(encryptedBytes, key);
    return jsonDecode(utf8.decode(clear)) as Map<String, dynamic>;
  }
}
