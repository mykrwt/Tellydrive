import '../../core/constants/app_constants.dart';
import 'chunk_info.dart';

/// Status of a [FileEntry] as far as TellyBase's sync engine is concerned.
enum SyncStatus {
  /// Exists locally, not yet uploaded (queued or in-flight).
  pendingUpload,

  /// Upload in progress; see [FileEntry.uploadedBytes] for progress.
  uploading,

  /// Fully uploaded and verified; local copy may or may not still exist.
  synced,

  /// Exists in the vault but not cached locally (e.g. a fresh device that
  /// just restored the index) — content is fetched on demand.
  cloudOnly,

  /// Currently being fetched from Telegram to local cache/storage.
  downloading,

  /// Upload or download failed after exhausting retries; user can retry.
  failed,

  /// User paused an in-flight transfer.
  paused,
}

/// The single unit of truth for every file TellyBase knows about, whether
/// it currently lives on-device, in the Telegram vault, or both.
///
/// A [FileEntry] plus its [ChunkInfo] list is *exactly* the information
/// needed to reconstruct the original file byte-for-byte from Telegram
/// alone — this is the metadata that gets serialized into the encrypted
/// manifest embedded in the vault, so a brand-new device can rebuild the
/// entire local index purely by reading the user's own Telegram chat.
class FileEntry {
  FileEntry({
    required this.id,
    required this.originalName,
    required this.folderPath,
    required this.mimeType,
    required this.category,
    required this.sizeBytes,
    required this.sha256,
    required this.createdAt,
    required this.modifiedAt,
    required this.uploadedAt,
    required this.isEncrypted,
    required this.chunks,
    required this.syncStatus,
    this.localPath,
    this.thumbnailLocalPath,
    this.uploadedBytes = 0,
    this.isFavorite = false,
    this.lastAccessedAt,
    this.deviceOrigin,
    this.accountId,
  });

  /// Stable TellyBase-internal id (uuid v4). Independent of Telegram
  /// message ids so re-uploads / migrations never break references.
  final String id;

  final String originalName;

  /// Virtual folder path inside TellyBase, e.g. "/Camera/2026/07" or
  /// "/Documents/Tax". Purely a local organisational concept — Telegram
  /// just sees a flat stream of messages in the vault chat/channel.
  final String folderPath;

  final String mimeType;
  final TellyFileCategory category;
  final int sizeBytes;

  /// SHA-256 of the *whole original file*, used for incremental-backup
  /// change detection and post-download integrity verification.
  final String sha256;

  final DateTime createdAt;
  final DateTime modifiedAt;
  final DateTime? uploadedAt;

  final bool isEncrypted;
  final List<ChunkInfo> chunks;
  final SyncStatus syncStatus;
  final int uploadedBytes;

  /// Path on this device if a local/cached copy currently exists.
  final String? localPath;
  final String? thumbnailLocalPath;

  final bool isFavorite;
  final DateTime? lastAccessedAt;

  /// Which device first uploaded this file (informational, shown in UI as
  /// "Backed up from iPhone 15" etc.).
  final String? deviceOrigin;

  /// Which signed-in Telegram account this file belongs to (TellyBase
  /// supports multiple linked accounts).
  final String? accountId;

  bool get isMultiChunk => chunks.length > 1;
  bool get hasLocalCopy => localPath != null;
  double get uploadProgress => sizeBytes == 0 ? 1.0 : uploadedBytes / sizeBytes;

  FileEntry copyWith({
    String? originalName,
    String? folderPath,
    SyncStatus? syncStatus,
    int? uploadedBytes,
    String? localPath,
    String? thumbnailLocalPath,
    bool? isFavorite,
    DateTime? lastAccessedAt,
    DateTime? uploadedAt,
    List<ChunkInfo>? chunks,
  }) {
    return FileEntry(
      id: id,
      originalName: originalName ?? this.originalName,
      folderPath: folderPath ?? this.folderPath,
      mimeType: mimeType,
      category: category,
      sizeBytes: sizeBytes,
      sha256: sha256,
      createdAt: createdAt,
      modifiedAt: modifiedAt,
      uploadedAt: uploadedAt ?? this.uploadedAt,
      isEncrypted: isEncrypted,
      chunks: chunks ?? this.chunks,
      syncStatus: syncStatus ?? this.syncStatus,
      uploadedBytes: uploadedBytes ?? this.uploadedBytes,
      localPath: localPath ?? this.localPath,
      thumbnailLocalPath: thumbnailLocalPath ?? this.thumbnailLocalPath,
      isFavorite: isFavorite ?? this.isFavorite,
      lastAccessedAt: lastAccessedAt ?? this.lastAccessedAt,
      deviceOrigin: deviceOrigin,
      accountId: accountId,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'originalName': originalName,
        'folderPath': folderPath,
        'mimeType': mimeType,
        'category': category.name,
        'sizeBytes': sizeBytes,
        'sha256': sha256,
        'createdAt': createdAt.toIso8601String(),
        'modifiedAt': modifiedAt.toIso8601String(),
        'uploadedAt': uploadedAt?.toIso8601String(),
        'isEncrypted': isEncrypted,
        'chunks': chunks.map((c) => c.toJson()).toList(),
        'syncStatus': syncStatus.name,
        'isFavorite': isFavorite,
        'lastAccessedAt': lastAccessedAt?.toIso8601String(),
        'deviceOrigin': deviceOrigin,
        'accountId': accountId,
      };

  factory FileEntry.fromJson(Map<String, dynamic> json) => FileEntry(
        id: json['id'] as String,
        originalName: json['originalName'] as String,
        folderPath: json['folderPath'] as String,
        mimeType: json['mimeType'] as String,
        category: TellyFileCategory.values.byName(json['category'] as String),
        sizeBytes: json['sizeBytes'] as int,
        sha256: json['sha256'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
        modifiedAt: DateTime.parse(json['modifiedAt'] as String),
        uploadedAt: json['uploadedAt'] == null ? null : DateTime.parse(json['uploadedAt'] as String),
        isEncrypted: json['isEncrypted'] as bool,
        chunks: (json['chunks'] as List)
            .map((c) => ChunkInfo.fromJson(c as Map<String, dynamic>))
            .toList(),
        syncStatus: SyncStatus.values.byName(json['syncStatus'] as String),
        isFavorite: json['isFavorite'] as bool? ?? false,
        lastAccessedAt:
            json['lastAccessedAt'] == null ? null : DateTime.parse(json['lastAccessedAt'] as String),
        deviceOrigin: json['deviceOrigin'] as String?,
        accountId: json['accountId'] as String?,
      );
}
