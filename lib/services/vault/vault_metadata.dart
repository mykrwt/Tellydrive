import 'dart:convert';

/// Metadata placed in Telegram document captions for an encrypted Vault file.
///
/// Each file in the Hidden Vault is encrypted locally before uploading to
/// Telegram. The Telegram file is stored as a `.tdvault` binary document that
/// cannot be previewed, played, or opened by standard Telegram clients.
///
/// This metadata stores:
/// - The file identity (original name, size, MIME type).
/// - The key-wrapping parameters (`salt`, `wrappedKey`, `wrapIv`, `verifyTag`),
///   enabling full Vault recovery after a phone reset or app reinstall as
///   long as the user enters the correct PIN/password.
/// - The media encryption initialization vector (`mediaIv`).
///
/// The user's PIN/password is NEVER stored in metadata or plaintext.
class VaultMetadata {
  static const String captionPrefix = 'TELEDRIVE_VAULT_V1:';

  final int version;
  final String uploadId;
  final String originalName;
  final int originalSize;
  final String mimeType;
  final String salt;
  final String wrappedKey;
  final String wrapIv;
  final String mediaIv;
  final String verifyTag;
  final DateTime uploadedAt;

  const VaultMetadata({
    this.version = 1,
    required this.uploadId,
    required this.originalName,
    required this.originalSize,
    required this.mimeType,
    required this.salt,
    required this.wrappedKey,
    required this.wrapIv,
    required this.mediaIv,
    required this.verifyTag,
    required this.uploadedAt,
  });

  String toCaption() {
    final compact = <String, dynamic>{
      'v': version,
      'u': uploadId,
      'n': originalName,
      's': originalSize,
      't': mimeType,
      'salt': salt,
      'wk': wrappedKey,
      'wIv': wrapIv,
      'mIv': mediaIv,
      'tag': verifyTag,
      'd': uploadedAt.millisecondsSinceEpoch,
    };
    return '$captionPrefix${jsonEncode(compact)}';
  }

  Map<String, dynamic> toJson() => {
        'version': version,
        'uploadId': uploadId,
        'originalName': originalName,
        'originalSize': originalSize,
        'mimeType': mimeType,
        'salt': salt,
        'wrappedKey': wrappedKey,
        'wrapIv': wrapIv,
        'mediaIv': mediaIv,
        'verifyTag': verifyTag,
        'uploadedAt': uploadedAt.toIso8601String(),
      };

  static VaultMetadata? tryParseCaption(Object? value) {
    final caption = value?.toString() ?? '';
    if (!caption.startsWith(captionPrefix)) return null;
    try {
      final map = jsonDecode(caption.substring(captionPrefix.length));
      if (map is! Map<String, dynamic>) return null;
      final uploadId = map['u']?.toString() ?? '';
      final originalName = map['n']?.toString() ?? '';
      final originalSize = (map['s'] as num?)?.toInt() ?? -1;
      final mimeType = map['t']?.toString() ?? 'application/octet-stream';
      final salt = map['salt']?.toString() ?? '';
      final wrappedKey = map['wk']?.toString() ?? '';
      final wrapIv = map['wIv']?.toString() ?? '';
      final mediaIv = map['mIv']?.toString() ?? '';
      final verifyTag = map['tag']?.toString() ?? '';
      final dateMillis = (map['d'] as num?)?.toInt() ?? 0;
      if (uploadId.isEmpty ||
          originalName.isEmpty ||
          originalSize < 0 ||
          salt.isEmpty ||
          wrappedKey.isEmpty ||
          wrapIv.isEmpty ||
          mediaIv.isEmpty ||
          verifyTag.isEmpty) {
        return null;
      }
      return VaultMetadata(
        version: (map['v'] as num?)?.toInt() ?? 1,
        uploadId: uploadId,
        originalName: originalName,
        originalSize: originalSize,
        mimeType: mimeType,
        salt: salt,
        wrappedKey: wrappedKey,
        wrapIv: wrapIv,
        mediaIv: mediaIv,
        verifyTag: verifyTag,
        uploadedAt: dateMillis > 0
            ? DateTime.fromMillisecondsSinceEpoch(dateMillis)
            : DateTime.now(),
      );
    } catch (_) {
      return null;
    }
  }
}
