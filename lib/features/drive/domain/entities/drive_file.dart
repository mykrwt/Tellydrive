import '../../../../services/transfers/chunk_metadata.dart';
import '../../../../services/vault/vault_metadata.dart';

enum DriveFileType { image, video, audio, pdf, document, archive, other }

/// A user-facing file in Telegram-backed storage.
///
/// A chunked file is represented by one DriveFile. Its internal Telegram
/// documents live in [chunks] and never become separate UI entries.
///
/// A Hidden Vault file carries [vaultMetadata] parsed from its Telegram
/// document caption and represents an encrypted `.tdvault` item.
class DriveFile {
  final String id;
  final String telegramMessageId;
  final String folderId;
  final String name;
  final DriveFileType type;
  final int size;
  final DateTime uploadedAt;
  final String? localPath;
  final String? thumbnailUrl;
  final String? thumbnailFileId;
  final String? mimeType;
  final bool isDownloaded;
  final bool isUploading;
  final double uploadProgress;
  final String? chunkUploadId;
  final List<DriveChunk> chunks;
  final List<String> telegramMessageIds;
  final VaultMetadata? vaultMetadata;

  const DriveFile({
    required this.id,
    required this.telegramMessageId,
    required this.folderId,
    required this.name,
    required this.type,
    required this.size,
    required this.uploadedAt,
    this.localPath,
    this.thumbnailUrl,
    this.thumbnailFileId,
    this.mimeType,
    this.isDownloaded = false,
    this.isUploading = false,
    this.uploadProgress = 0,
    this.chunkUploadId,
    this.chunks = const [],
    this.telegramMessageIds = const [],
    this.vaultMetadata,
  });

  bool get isChunked => chunkUploadId != null;

  bool get isVaultFile => vaultMetadata != null;

  /// True if this is a chunked file that hasn't been fully uploaded.
  /// Covers: no chunks, missing indexes, non-contiguous parts.
  bool get isIncomplete {
    if (!isChunked) return false;
    if (chunks.isEmpty) return true;
    final sorted = [...chunks]..sort((a, b) => a.index.compareTo(b.index));
    for (var i = 0; i < sorted.length; i++) {
      if (sorted[i].index != i) return true;
    }
    return false;
  }

  bool get isValid => !isIncomplete;

  List<String> get allTelegramMessageIds => telegramMessageIds.isNotEmpty
      ? telegramMessageIds
      : <String>[telegramMessageId];

  DriveFile copyWith({
    String? id,
    String? telegramMessageId,
    String? folderId,
    String? name,
    DriveFileType? type,
    int? size,
    DateTime? uploadedAt,
    String? localPath,
    String? thumbnailUrl,
    String? thumbnailFileId,
    String? mimeType,
    bool? isDownloaded,
    bool? isUploading,
    double? uploadProgress,
    String? chunkUploadId,
    List<DriveChunk>? chunks,
    List<String>? telegramMessageIds,
    VaultMetadata? vaultMetadata,
    bool clearVaultMetadata = false,
  }) {
    return DriveFile(
      id: id ?? this.id,
      telegramMessageId: telegramMessageId ?? this.telegramMessageId,
      folderId: folderId ?? this.folderId,
      name: name ?? this.name,
      type: type ?? this.type,
      size: size ?? this.size,
      uploadedAt: uploadedAt ?? this.uploadedAt,
      localPath: localPath ?? this.localPath,
      thumbnailUrl: thumbnailUrl ?? this.thumbnailUrl,
      thumbnailFileId: thumbnailFileId ?? this.thumbnailFileId,
      mimeType: mimeType ?? this.mimeType,
      isDownloaded: isDownloaded ?? this.isDownloaded,
      isUploading: isUploading ?? this.isUploading,
      uploadProgress: uploadProgress ?? this.uploadProgress,
      chunkUploadId: chunkUploadId ?? this.chunkUploadId,
      chunks: chunks ?? this.chunks,
      telegramMessageIds: telegramMessageIds ?? this.telegramMessageIds,
      vaultMetadata: clearVaultMetadata ? null : vaultMetadata ?? this.vaultMetadata,
    );
  }
}
