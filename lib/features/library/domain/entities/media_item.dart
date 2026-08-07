import 'package:flutter/foundation.dart';

import '../../../../core/utils/media_type.dart';

/// A single photo/video stored in the Telegram vault, fully described by the
/// metadata caption on its first chunk message. This entity is protocol- and
/// Flutter-agnostic so it can be reconstructed purely from Telegram history.
@immutable
class MediaItem {
  const MediaItem({
    required this.id,
    required this.fileName,
    required this.mimeType,
    required this.size,
    required this.uploadedAt,
    required this.firstMessageId,
    required this.chunkMessageIds,
    this.capturedAt,
    this.albumId,
    this.albumName,
    this.favorite = false,
    this.trashed = false,
  });

  /// Stable TellyBase identifier (uuid).
  final String id;

  /// ORIGINAL filename — preserved exactly end to end.
  final String fileName;

  /// MIME type of the logical file.
  final String mimeType;

  /// Total logical size in bytes (sum over all chunks).
  final int size;

  /// When the item was uploaded.
  final DateTime uploadedAt;

  /// Capture time if known (exif/device date), otherwise [uploadedAt].
  final DateTime? capturedAt;

  /// Telegram message id of chunk 0 (the one carrying full metadata).
  final int firstMessageId;

  /// Telegram message ids of every chunk (chunk 0 first). Single-chunk items
  /// have exactly one entry equal to [firstMessageId].
  final List<int> chunkMessageIds;

  final String? albumId;
  final String? albumName;
  final bool favorite;
  final bool trashed;

  MediaType get mediaType => MediaClassifier.of(mimeType, fileName);

  DateTime get displayDate => capturedAt ?? uploadedAt;

  int get chunkCount => chunkMessageIds.length;

  MediaItem copyWith({
    String? fileName,
    String? mimeType,
    int? size,
    DateTime? uploadedAt,
    DateTime? capturedAt,
    String? albumId,
    String? albumName,
    bool? favorite,
    bool? trashed,
  }) =>
      MediaItem(
        id: id,
        fileName: fileName ?? this.fileName,
        mimeType: mimeType ?? this.mimeType,
        size: size ?? this.size,
        uploadedAt: uploadedAt ?? this.uploadedAt,
        capturedAt: capturedAt ?? this.capturedAt,
        firstMessageId: firstMessageId,
        chunkMessageIds: chunkMessageIds,
        albumId: albumId ?? this.albumId,
        albumName: albumName ?? this.albumName,
        favorite: favorite ?? this.favorite,
        trashed: trashed ?? this.trashed,
      );

  /// Returns a copy with the chunk message ids filled in after upload.
  MediaItem withMessageIds(int firstMessageId, List<int> chunkMessageIds) =>
      MediaItem(
        id: id,
        fileName: fileName,
        mimeType: mimeType,
        size: size,
        uploadedAt: uploadedAt,
        capturedAt: capturedAt,
        firstMessageId: firstMessageId,
        chunkMessageIds: chunkMessageIds,
        albumId: albumId,
        albumName: albumName,
        favorite: favorite,
        trashed: trashed,
      );

  /// Round-trips with [MediaItem.toMetadataJson] / [fromMetadata].
  factory MediaItem.fromMetadata(Map<String, dynamic> json) {
    final ch = (json['ch'] as List<dynamic>? ?? const [])
        .map((e) => e as int)
        .toList();
    final first = json['first'] as int? ?? 0;
    final msgIds = ch.isEmpty ? <int>[first] : ch;
    return MediaItem(
      id: json['id'] as String,
      fileName: json['fn'] as String,
      mimeType: json['m'] as String? ?? 'application/octet-stream',
      size: json['s'] as int? ?? 0,
      uploadedAt: DateTime.fromMillisecondsSinceEpoch(
        (json['u'] as int? ?? 0) * 1000,
      ),
      capturedAt: json['c'] != null
          ? DateTime.fromMillisecondsSinceEpoch((json['c'] as int) * 1000)
          : null,
      firstMessageId: first,
      chunkMessageIds: msgIds,
      albumId: json['a'] as String?,
      albumName: json['an'] as String?,
      favorite: json['f'] as bool? ?? false,
      trashed: json['tr'] as bool? ?? false,
    );
  }

  /// Compact metadata record written into the first chunk's caption.
  Map<String, dynamic> toMetadataJson() => {
        'v': 1,
        't': 'item',
        'id': id,
        'fn': fileName,
        'm': mimeType,
        's': size,
        'u': uploadedAt.millisecondsSinceEpoch ~/ 1000,
        if (capturedAt != null) 'c': capturedAt!.millisecondsSinceEpoch ~/ 1000,
        'a': albumId,
        'an': albumName,
        'f': favorite,
        'tr': trashed,
        'n': chunkCount,
        'first': firstMessageId,
        'ch': chunkMessageIds,
      };

  @override
  bool operator ==(Object other) =>
      other is MediaItem && other.id == id;

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() => 'MediaItem($fileName, ${size} bytes, $chunkCount chunks)';
}
