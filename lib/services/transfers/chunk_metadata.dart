import 'dart:convert';

/// Metadata placed in Telegram document captions for a chunked upload.
///
/// Captions make the virtual file index available without downloading a sidecar
/// file. A JSON manifest is still uploaded after all parts so the upload is
/// committed atomically from the user's point of view.
class ChunkMetadata {
  static const String captionPrefix = 'TELEDRIVE_CHUNK_V1:';
  static const String chunkRole = 'chunk';
  static const String manifestRole = 'manifest';

  final String role;
  final String uploadId;
  final String originalName;
  final int originalSize;
  final String mimeType;
  final int chunkCount;
  final int? chunkIndex;

  const ChunkMetadata({
    required this.role,
    required this.uploadId,
    required this.originalName,
    required this.originalSize,
    required this.mimeType,
    required this.chunkCount,
    this.chunkIndex,
  });

  bool get isChunk => role == chunkRole;
  bool get isManifest => role == manifestRole;

  String toCaption() {
    final compact = <String, dynamic>{
      'r': role == chunkRole ? 'c' : 'm',
      'u': uploadId,
      'n': originalName,
      's': originalSize,
      't': mimeType,
      'c': chunkCount,
      if (chunkIndex != null) 'i': chunkIndex,
    };
    return '$captionPrefix${jsonEncode(compact)}';
  }

  Map<String, dynamic> toJson() => {
        'version': 1,
        'role': role,
        'uploadId': uploadId,
        'originalName': originalName,
        'originalSize': originalSize,
        'mimeType': mimeType,
        'chunkCount': chunkCount,
        if (chunkIndex != null) 'chunkIndex': chunkIndex,
      };

  static ChunkMetadata? tryParseCaption(Object? value) {
    final caption = value?.toString() ?? '';
    if (!caption.startsWith(captionPrefix)) return null;
    try {
      final map = jsonDecode(caption.substring(captionPrefix.length));
      if (map is! Map<String, dynamic>) return null;
      final role = map['r'] == 'c' ? chunkRole : manifestRole;
      final uploadId = map['u']?.toString() ?? '';
      final originalName = map['n']?.toString() ?? '';
      final originalSize = (map['s'] as num?)?.toInt() ?? -1;
      final mimeType = map['t']?.toString() ?? 'application/octet-stream';
      final chunkCount = (map['c'] as num?)?.toInt() ?? 0;
      final chunkIndex = (map['i'] as num?)?.toInt();
      if (uploadId.isEmpty ||
          originalName.isEmpty ||
          originalSize < 0 ||
          chunkCount <= 0 ||
          (role == chunkRole &&
              (chunkIndex == null ||
                  chunkIndex < 0 ||
                  chunkIndex >= chunkCount))) {
        return null;
      }
      return ChunkMetadata(
        role: role,
        uploadId: uploadId,
        originalName: originalName,
        originalSize: originalSize,
        mimeType: mimeType,
        chunkCount: chunkCount,
        chunkIndex: chunkIndex,
      );
    } catch (_) {
      return null;
    }
  }
}

class DriveChunk {
  final int index;
  final String telegramFileId;
  final String telegramMessageId;
  final int size;

  const DriveChunk({
    required this.index,
    required this.telegramFileId,
    required this.telegramMessageId,
    required this.size,
  });

  Map<String, dynamic> toJson() => {
        'index': index,
        'fileId': telegramFileId,
        'messageId': telegramMessageId,
        'size': size,
      };
}
