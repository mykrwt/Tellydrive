/// Metadata for exactly one uploaded segment ("chunk") of a [FileEntry].
///
/// This is the piece of information that lets TellyBase find a segment
/// again inside the user's Telegram vault and put it back in the right
/// place during reconstruction — it is intentionally self-contained enough
/// that, combined with the parent [FileEntry], a full index rebuild from a
/// bare Telegram chat scan is possible without any other source of truth.
class ChunkInfo {
  ChunkInfo({
    required this.index,
    required this.byteStart,
    required this.byteEnd,
    required this.plainSha256,
    required this.encryptedSizeBytes,
    required this.telegramMessageId,
    required this.telegramFileId,
    this.telegramAccessHash,
    this.telegramFileReferenceBase64,
    this.uploaded = false,
  });

  final int index;
  final int byteStart;
  final int byteEnd;
  final String plainSha256;
  final int encryptedSizeBytes;

  /// Id of the Telegram message that carries this chunk as a document.
  /// This is the pointer TellyBase uses to re-download the chunk later,
  /// and the id that a from-scratch vault scan uses to recognize and
  /// group chunks belonging to the same original file.
  final int telegramMessageId;

  /// Telegram's internal file id for the uploaded document (needed to
  /// construct the download request alongside [telegramAccessHash]).
  final int telegramFileId;
  final int? telegramAccessHash;

  /// Documents on Telegram are addressed by a short-lived "file reference"
  /// blob (base64-encoded here for JSON storage) in addition to their id
  /// and access hash — Telegram requires the *current* reference for
  /// downloads and rotates it periodically. TellyBase always re-fetches a
  /// fresh reference from the source message right before downloading
  /// (see FileRepository.downloadFile), so this cached copy is only a
  /// fast-path hint, not the sole source of truth.
  final String? telegramFileReferenceBase64;

  final bool uploaded;

  int get plainSizeBytes => byteEnd - byteStart;

  ChunkInfo copyWith({
    int? telegramMessageId,
    int? telegramFileId,
    int? telegramAccessHash,
    String? telegramFileReferenceBase64,
    bool? uploaded,
  }) =>
      ChunkInfo(
        index: index,
        byteStart: byteStart,
        byteEnd: byteEnd,
        plainSha256: plainSha256,
        encryptedSizeBytes: encryptedSizeBytes,
        telegramMessageId: telegramMessageId ?? this.telegramMessageId,
        telegramFileId: telegramFileId ?? this.telegramFileId,
        telegramAccessHash: telegramAccessHash ?? this.telegramAccessHash,
        telegramFileReferenceBase64: telegramFileReferenceBase64 ?? this.telegramFileReferenceBase64,
        uploaded: uploaded ?? this.uploaded,
      );

  Map<String, dynamic> toJson() => {
        'index': index,
        'byteStart': byteStart,
        'byteEnd': byteEnd,
        'plainSha256': plainSha256,
        'encryptedSizeBytes': encryptedSizeBytes,
        'telegramMessageId': telegramMessageId,
        'telegramFileId': telegramFileId,
        'telegramAccessHash': telegramAccessHash,
        'telegramFileReferenceBase64': telegramFileReferenceBase64,
        'uploaded': uploaded,
      };

  factory ChunkInfo.fromJson(Map<String, dynamic> json) => ChunkInfo(
        index: json['index'] as int,
        byteStart: json['byteStart'] as int,
        byteEnd: json['byteEnd'] as int,
        plainSha256: json['plainSha256'] as String,
        encryptedSizeBytes: json['encryptedSizeBytes'] as int,
        telegramMessageId: json['telegramMessageId'] as int,
        telegramFileId: json['telegramFileId'] as int,
        telegramAccessHash: json['telegramAccessHash'] as int?,
        telegramFileReferenceBase64: json['telegramFileReferenceBase64'] as String?,
        uploaded: json['uploaded'] as bool? ?? false,
      );
}
