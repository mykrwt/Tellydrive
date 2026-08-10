import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mime/mime.dart';
import 'package:path/path.dart' as p;
import 'package:uuid/uuid.dart';

import '../../../../services/vault/vault_crypto_service.dart';
import '../../../../services/vault/vault_metadata.dart';
import '../../../../services/vault/vault_service.dart';
import '../../../drive/data/repositories/drive_repository_impl.dart';
import '../../../drive/domain/entities/drive_file.dart';
import '../../../drive/domain/repositories/drive_repository.dart';
import '../../../drive/presentation/providers/drive_provider.dart';
import '../../../gallery/presentation/providers/gallery_provider.dart';

class VaultState {
  final bool isUnlocked;
  final bool isConfigured;
  final bool isLoading;
  final String? error;
  final List<DriveFile> media;
  final List<int>? unlockedKey;

  const VaultState({
    this.isUnlocked = false,
    this.isConfigured = false,
    this.isLoading = false,
    this.error,
    this.media = const [],
    this.unlockedKey,
  });

  VaultState copyWith({
    bool? isUnlocked,
    bool? isConfigured,
    bool? isLoading,
    String? error,
    bool clearError = false,
    List<DriveFile>? media,
    List<int>? unlockedKey,
    bool clearKey = false,
  }) =>
      VaultState(
        isUnlocked: isUnlocked ?? this.isUnlocked,
        isConfigured: isConfigured ?? this.isConfigured,
        isLoading: isLoading ?? this.isLoading,
        error: clearError ? null : error ?? this.error,
        media: media ?? this.media,
        unlockedKey: clearKey ? null : unlockedKey ?? this.unlockedKey,
      );
}

class VaultNotifier extends StateNotifier<VaultState> {
  VaultNotifier(this._ref) : super(const VaultState()) {
    checkStatus();
  }

  final Ref _ref;

  Future<List<DriveFile>> _findAllVaultFiles() async {
    final repository = _ref.read(driveRepositoryProvider);
    final folders = await repository.getFolders();
    final filesByFolder = await Future.wait(
      folders.map((folder) => repository.getVaultFiles(folderId: folder.id)),
    );
    return filesByFolder.expand((files) => files).toList();
  }

  /// Checks if the user has already configured a Vault PIN on this device or
  /// if encrypted `.tdvault` recovery files exist on Telegram storage.
  Future<void> checkStatus() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final locallyConfigured =
          await VaultService.instance.isVaultConfiguredLocally();
      if (locallyConfigured) {
        state = state.copyWith(isConfigured: true, isLoading: false);
        return;
      }

      // If not configured locally (e.g. phone reset or fresh install), check
      // Telegram for existing `.tdvault` files with recovery metadata across all folders.
      var remoteExists = false;
      try {
        final remoteVaultFiles = await _findAllVaultFiles();
        remoteExists = remoteVaultFiles.isNotEmpty;
      } catch (_) {
        remoteExists = false;
      }

      state = state.copyWith(
        isConfigured: remoteExists,
        isLoading: false,
      );
    } catch (error) {
      state = state.copyWith(
        isLoading: false,
        error: 'Failed to check vault status: $error',
      );
    }
  }

  /// First time setup: generates a random Vault Encryption Key, salt, and IVs,
  /// wraps the key using PBKDF2-HMAC-SHA256 with the user's PIN, and unlocks.
  Future<void> createVault(String pin) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final vaultKey = VaultCryptoService.instance.generateVaultKey();
      final salt = VaultCryptoService.instance.generateSalt();
      final wrapIv = VaultCryptoService.instance.generateNonce();

      final wrappedKey = VaultCryptoService.instance.wrapVaultKey(
        vaultKey: vaultKey,
        pin: pin,
        salt: salt,
        iv: wrapIv,
      );

      final verifyTag = VaultCryptoService.instance.computeVerifyTag(vaultKey);

      await VaultService.instance.saveLocalVaultConfig(
        saltBase64: base64Encode(salt),
        wrappedKeyBase64: base64Encode(wrappedKey),
        wrapIvBase64: base64Encode(wrapIv),
        verifyTagBase64: verifyTag,
      );

      state = state.copyWith(
        isUnlocked: true,
        isConfigured: true,
        unlockedKey: vaultKey,
        isLoading: false,
      );
      await refresh();
    } catch (error) {
      state = state.copyWith(
        isLoading: false,
        error: 'Failed to create Vault: $error',
      );
    }
  }

  /// Unlocks the Vault by deriving the key from [pin] and unwrapping the
  /// stored Vault Encryption Key. Works both on the original phone and after
  /// a phone reset/reinstall by reading recovery metadata from `.tdvault` files.
  Future<bool> unlock(String pin) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      Map<String, String>? config =
          await VaultService.instance.readLocalVaultConfig();

      if (config == null) {
        // Reinstall / phone reset: read recovery metadata from Telegram files across all folders.
        final remoteVaultFiles = await _findAllVaultFiles();
        if (remoteVaultFiles.isEmpty ||
            remoteVaultFiles.first.vaultMetadata == null) {
          state = state.copyWith(
            isLoading: false,
            error: 'No Vault configuration found.',
          );
          return false;
        }
        final meta = remoteVaultFiles.first.vaultMetadata!;
        config = {
          'salt': meta.salt,
          'wrappedKey': meta.wrappedKey,
          'wrapIv': meta.wrapIv,
          'verifyTag': meta.verifyTag,
        };
      }

      final salt = base64Decode(config['salt']!);
      final wrappedKey = base64Decode(config['wrappedKey']!);
      final wrapIv = base64Decode(config['wrapIv']!);
      final expectedTag = config['verifyTag']!;

      final candidateKey = VaultCryptoService.instance.unwrapVaultKey(
        wrappedKey: wrappedKey,
        pin: pin,
        salt: salt,
        iv: wrapIv,
      );

      final isValid = VaultCryptoService.instance.verifyVaultKey(
        candidateKey,
        expectedTag,
      );
      if (!isValid) {
        state = state.copyWith(isLoading: false);
        return false;
      }

      // Store locally so subsequent logins on this device are instant.
      await VaultService.instance.saveLocalVaultConfig(
        saltBase64: config['salt']!,
        wrappedKeyBase64: config['wrappedKey']!,
        wrapIvBase64: config['wrapIv']!,
        verifyTagBase64: expectedTag,
      );

      state = state.copyWith(
        isUnlocked: true,
        unlockedKey: candidateKey,
        isLoading: false,
      );
      await refresh();
      return true;
    } catch (error) {
      state = state.copyWith(
        isLoading: false,
        error: 'Failed to unlock Vault: $error',
      );
      return false;
    }
  }

  /// Locks the Vault, removes the decrypted key from RAM, and deletes all
  /// temporary decrypted files from the device.
  Future<void> lock() async {
    await VaultService.instance.clearDecryptedCache();
    state = VaultState(
      isUnlocked: false,
      isConfigured: true,
      media: const [],
      unlockedKey: null,
    );
  }

  /// Reloads all encrypted Vault media from Telegram storage across all folders.
  Future<void> refresh() async {
    if (!state.isUnlocked) return;
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final files = await _findAllVaultFiles();
      final media = files
          .where((file) =>
              file.type == DriveFileType.image ||
              file.type == DriveFileType.video)
          .toList()
        ..sort((a, b) => b.uploadedAt.compareTo(a.uploadedAt));
      state = state.copyWith(media: media, isLoading: false);
    } catch (error) {
      state = state.copyWith(
        isLoading: false,
        error: 'Failed to refresh Vault: $error',
      );
    }
  }

  /// Encrypts and uploads a single local file as a `.tdvault` document.
  /// Caller is responsible for refreshing state afterwards — this keeps batch
  /// operations from triggering one full Telegram scan per file.
  Future<void> _encryptAndUploadOne({
    required String localPath,
    required String folderId,
    required DriveRepository repository,
    required Map<String, String> config,
    void Function(double progress)? onProgress,
  }) async {
    final source = File(localPath);
    if (!await source.exists()) return;

    final originalName = p.basename(localPath);
    final originalSize = await source.length();
    final mimeType =
        lookupMimeType(originalName) ?? 'application/octet-stream';
    final uploadId = const Uuid().v4();
    final mediaIv = VaultCryptoService.instance.generateNonce();

    // Step 1: Local encryption BEFORE Telegram upload.
    final encryptedFile = await VaultService.instance.encryptToVaultFile(
      localPath: localPath,
      uploadId: uploadId,
      vaultKey: state.unlockedKey!,
      mediaIv: mediaIv,
      onProgress: (val) => onProgress?.call(val * 0.5),
    );

    final metadata = VaultMetadata(
      version: 1,
      uploadId: uploadId,
      originalName: originalName,
      originalSize: originalSize,
      mimeType: mimeType,
      salt: config['salt']!,
      wrappedKey: config['wrappedKey']!,
      wrapIv: config['wrapIv']!,
      mediaIv: base64Encode(mediaIv),
      verifyTag: config['verifyTag']!,
      uploadedAt: DateTime.now(),
    );

    try {
      // Step 2: Upload ONLY the encrypted file to Telegram.
      await repository.uploadVaultFile(
        localPath: encryptedFile.path,
        fileName: encryptedFile.path,
        folderId: folderId,
        vaultMetadata: metadata,
        onProgress: (val) => onProgress?.call(0.5 + val * 0.5),
      );
    } finally {
      // Step 3: Delete the temporary encrypted file from disk.
      if (await encryptedFile.exists()) {
        await encryptedFile.delete();
      }
    }
  }

  /// Encrypts local media files BEFORE uploading them to Telegram as `.tdvault`
  /// files with full recovery metadata in their document captions.
  Future<void> uploadMediaToVault(
    List<String> localPaths, {
    String folderId = DriveRepositoryImpl.savedMessagesId,
    void Function(double progress)? onProgress,
  }) async {
    if (!state.isUnlocked || state.unlockedKey == null) {
      throw StateError('Vault must be unlocked to encrypt and upload files.');
    }
    final config = await VaultService.instance.readLocalVaultConfig();
    if (config == null) {
      throw StateError('Vault recovery configuration is missing.');
    }

    final repository = _ref.read(driveRepositoryProvider);
    final total = localPaths.length;
    for (var i = 0; i < total; i++) {
      final index = i;
      await _encryptAndUploadOne(
        localPath: localPaths[i],
        folderId: folderId,
        repository: repository,
        config: config,
        onProgress: (val) => onProgress?.call((index + val) / total),
      );
    }

    onProgress?.call(1.0);
    await refresh();
  }

  /// Moves media from the normal Gallery into the encrypted Hidden Vault.
  ///
  /// 1. Downloads original media if not already local.
  /// 2. Encrypts locally and uploads `.tdvault` file to Telegram.
  /// 3. Deletes the unencrypted media from Telegram.
  Future<void> moveFromGalleryToVault(
    List<DriveFile> galleryFiles, {
    void Function(double progress)? onProgress,
  }) async {
    if (!state.isUnlocked || state.unlockedKey == null) {
      throw StateError('Vault must be unlocked.');
    }
    final config = await VaultService.instance.readLocalVaultConfig();
    if (config == null) {
      throw StateError('Vault recovery configuration is missing.');
    }
    final repository = _ref.read(driveRepositoryProvider);
    final total = galleryFiles.length;
    for (var i = 0; i < total; i++) {
      final file = galleryFiles[i];
      var localPath = file.localPath;
      if (localPath == null || localPath.isEmpty || !await File(localPath).exists()) {
        localPath = await repository.downloadFile(file: file);
      }
      final index = i;
      await _encryptAndUploadOne(
        localPath: localPath,
        folderId: file.folderId,
        repository: repository,
        config: config,
        onProgress: (val) => onProgress?.call((index + val) / total),
      );
      // Delete the original right after its encrypted copy landed so an
      // interrupted batch can't leave the same photo in both places.
      await repository.deleteFile(file);
    }
    await refresh();
    _ref.read(galleryProvider.notifier).refresh();
  }

  /// Decrypts an item from the Vault back to the normal Gallery ("unvault").
  Future<void> unvaultToGallery(List<DriveFile> vaultFiles) async {
    if (!state.isUnlocked || state.unlockedKey == null) {
      throw StateError('Vault must be unlocked.');
    }
    final repository = _ref.read(driveRepositoryProvider);
    for (final file in vaultFiles) {
      final decryptedPath = await getDecryptedFile(file);
      await repository.uploadFile(
        localPath: decryptedPath,
        fileName: file.name,
        folderId: DriveRepositoryImpl.savedMessagesId,
      );
    }
    await repository.deleteFiles(vaultFiles);
    await refresh();
    _ref.read(galleryProvider.notifier).refresh();
  }

  /// Lazily decrypts an encrypted `.tdvault` Telegram file into the secure
  /// temporary `vault_cache` directory for viewing, playback, export, or share.
  Future<String> getDecryptedFile(
    DriveFile file, {
    void Function(double progress)? onProgress,
  }) async {
    if (!state.isUnlocked || state.unlockedKey == null) {
      throw StateError('Vault must be unlocked.');
    }
    final repository = _ref.read(driveRepositoryProvider);
    final encryptedPath = await repository.downloadFile(
      file: file,
      onProgress: (p) => onProgress?.call(p * 0.5),
    );
    return VaultService.instance.decryptVaultFileToCache(
      file: file,
      encryptedTelegramPath: encryptedPath,
      vaultKey: state.unlockedKey!,
      onProgress: (p) => onProgress?.call(0.5 + p * 0.5),
    );
  }

  /// Deletes encrypted `.tdvault` files from Telegram.
  Future<void> deleteMedia(List<DriveFile> files) async {
    if (files.isEmpty) return;
    await _ref.read(driveRepositoryProvider).deleteFiles(files);
    final removedIds = files.map((f) => f.id).toSet();
    state = state.copyWith(
      media: state.media.where((f) => !removedIds.contains(f.id)).toList(),
    );
  }
}

final vaultProvider =
    StateNotifierProvider<VaultNotifier, VaultState>((ref) {
  return VaultNotifier(ref);
});
