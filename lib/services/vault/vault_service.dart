import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../features/drive/domain/entities/drive_file.dart';
import '../storage/secure_storage_service.dart';
import 'vault_crypto_service.dart';
import 'vault_metadata.dart';

/// Orchestrates encryption, decryption, and cache cleanup for the Hidden Vault.
///
/// Ensures:
/// - Media is ALWAYS encrypted locally before any upload to Telegram.
/// - Decrypted media is cached only in an internal app temporary directory
///   (`vault_cache`) while the Vault is unlocked.
/// - When the Vault locks, all decrypted files are wiped from disk.
class VaultService {
  VaultService._();
  static final VaultService instance = VaultService._();

  static const String _saltKey = 'vault_salt_v1';
  static const String _wrappedKeyKey = 'vault_wrapped_key_v1';
  static const String _wrapIvKey = 'vault_wrap_iv_v1';
  static const String _verifyTagKey = 'vault_verify_tag_v1';
  static const String _initializedKey = 'vault_initialized_v1';

  /// Returns true if a Vault PIN has been configured and stored locally on
  /// this device.
  Future<bool> isVaultConfiguredLocally() async {
    final val = await SecureStorageService.instance.read(_initializedKey);
    return val == 'true';
  }

  /// Stores the Vault recovery metadata in secure storage after creating or
  /// restoring a Vault.
  Future<void> saveLocalVaultConfig({
    required String saltBase64,
    required String wrappedKeyBase64,
    required String wrapIvBase64,
    required String verifyTagBase64,
  }) async {
    await SecureStorageService.instance.write(_saltKey, saltBase64);
    await SecureStorageService.instance.write(_wrappedKeyKey, wrappedKeyBase64);
    await SecureStorageService.instance.write(_wrapIvKey, wrapIvBase64);
    await SecureStorageService.instance.write(_verifyTagKey, verifyTagBase64);
    await SecureStorageService.instance.write(_initializedKey, 'true');
  }

  /// Reads local Vault recovery metadata from secure storage.
  /// Returns null if not configured locally.
  Future<Map<String, String>?> readLocalVaultConfig() async {
    final salt = await SecureStorageService.instance.read(_saltKey);
    final wk = await SecureStorageService.instance.read(_wrappedKeyKey);
    final wIv = await SecureStorageService.instance.read(_wrapIvKey);
    final tag = await SecureStorageService.instance.read(_verifyTagKey);
    if (salt == null || wk == null || wIv == null || tag == null) {
      return null;
    }
    return {
      'salt': salt,
      'wrappedKey': wk,
      'wrapIv': wIv,
      'verifyTag': tag,
    };
  }

  /// Clears local Vault setup from secure storage.
  Future<void> clearLocalVaultConfig() async {
    await SecureStorageService.instance.delete(_saltKey);
    await SecureStorageService.instance.delete(_wrappedKeyKey);
    await SecureStorageService.instance.delete(_wrapIvKey);
    await SecureStorageService.instance.delete(_verifyTagKey);
    await SecureStorageService.instance.delete(_initializedKey);
  }

  /// Returns the temporary directory where decrypted Vault media is cached while
  /// the Vault is unlocked.
  Future<Directory> getVaultCacheDirectory() async {
    final support = await getApplicationSupportDirectory();
    final dir = Directory(p.join(support.path, 'vault_cache'));
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }
    return dir;
  }

  /// Immediately deletes all unencrypted files from the internal vault cache.
  /// Called automatically whenever the Vault is locked or closed.
  Future<void> clearDecryptedCache() async {
    try {
      final dir = await getVaultCacheDirectory();
      if (await dir.exists()) {
        await dir.delete(recursive: true);
      }
    } catch (_) {}
  }

  String _safeFileName(String name) =>
      name.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');

  /// Encrypts the plaintext file at [localPath] into a temporary `.tdvault`
  /// file ready for Telegram upload.
  Future<File> encryptToVaultFile({
    required String localPath,
    required String uploadId,
    required List<int> vaultKey,
    required List<int> mediaIv,
    void Function(double progress)? onProgress,
  }) async {
    final source = File(localPath);
    if (!await source.exists()) {
      throw FileSystemException('Source media file not found', localPath);
    }

    final tempDir = await getTemporaryDirectory();
    final stagingDir = Directory(p.join(tempDir.path, 'vault_staging'));
    if (!await stagingDir.exists()) {
      await stagingDir.create(recursive: true);
    }

    final encryptedFile = File(
      p.join(stagingDir.path, 'TLB_VAULT_$uploadId.tdvault'),
    );
    if (await encryptedFile.exists()) {
      await encryptedFile.delete();
    }

    await VaultCryptoService.instance.encryptFile(
      source: source,
      destination: encryptedFile,
      vaultKey: vaultKey,
      nonce: mediaIv,
      onProgress: onProgress,
    );

    return encryptedFile;
  }

  /// Decrypts a downloaded `.tdvault` file into the temporary `vault_cache`
  /// directory so the Vault UI can view, play, share, or export it.
  Future<String> decryptVaultFileToCache({
    required DriveFile file,
    required String encryptedTelegramPath,
    required List<int> vaultKey,
    void Function(double progress)? onProgress,
  }) async {
    final metadata = file.vaultMetadata;
    if (metadata == null) {
      throw StateError('Cannot decrypt file without Vault metadata.');
    }

    final cacheDir = await getVaultCacheDirectory();
    final outName = '${file.id}_${_safeFileName(metadata.originalName)}';
    final destination = File(p.join(cacheDir.path, outName));

    if (await destination.exists() &&
        await destination.length() == metadata.originalSize) {
      onProgress?.call(1.0);
      return destination.path;
    }

    final encryptedFile = File(encryptedTelegramPath);
    if (!await encryptedFile.exists()) {
      throw FileSystemException(
        'Encrypted Telegram file missing',
        encryptedTelegramPath,
      );
    }

    final mediaIvBytes = base64Decode(metadata.mediaIv);
    await VaultCryptoService.instance.decryptFile(
      source: encryptedFile,
      destination: destination,
      vaultKey: vaultKey,
      nonce: mediaIvBytes,
      onProgress: onProgress,
    );

    final actualSize = await destination.length();
    if (actualSize != metadata.originalSize) {
      await destination.delete();
      throw StateError('Decrypted file size does not match Vault metadata.');
    }

    onProgress?.call(1.0);
    return destination.path;
  }
}
