/// Central tunables for TellyBase's storage engine.
///
/// These numbers encode two *independent* chunking layers that together
/// let TellyBase store a file of literally any size inside Telegram:
///
/// 1. **Wire parts** (MTProto protocol requirement): every upload to
///    Telegram — no matter how small — must itself be transmitted in fixed
///    size binary parts via `upload.saveFilePart` / `upload.saveBigFilePart`.
///    This is mandatory MTProto behaviour, not something TellyBase invented.
/// 2. **Segments** (TellyBase requirement): if the *original* file is
///    larger than Telegram's per-upload ceiling, TellyBase pre-splits the
///    source file into multiple encrypted segments *before* handing each
///    one to the wire-part uploader. Each segment becomes its own Telegram
///    message/document. The manifest records the ordered segment list so
///    download can fetch + decrypt + concatenate them back losslessly.
class AppConstants {
  const AppConstants._();

  // ---------------------------------------------------------------------
  // MTProto wire-level part size (protocol-mandated).
  // ---------------------------------------------------------------------
  /// Part size used for small-file uploads (`upload.saveFilePart`). Must be
  /// a multiple of 1024 and evenly divide into the file (except the final
  /// part). Telegram requires 512 KiB max for big-file transport.
  static const int wirePartBytes = 512 * 1024; // 512 KiB

  /// Above this size Telegram requires using the "big file" upload flow
  /// (`upload.saveBigFilePart`, `isBigFile = true`) instead of
  /// `upload.saveFilePart`.
  static const int bigFileThresholdBytes = 10 * 1024 * 1024; // 10 MiB

  /// Big-file uploads are limited to a maximum of 4000 wire parts.
  static const int maxWirePartsPerUpload = 4000;

  // ---------------------------------------------------------------------
  // TellyBase segment size (our own splitting layer).
  // ---------------------------------------------------------------------
  /// Max size of a single Telegram message's document. Regular accounts are
  /// capped at 2,000 MB by Telegram; Premium accounts get 4,000 MB. We use
  /// a conservative default so behaviour is correct even on a free account,
  /// and leave headroom below the hard cap for encryption overhead
  /// (AES-GCM adds a 16-byte tag + 12-byte nonce per segment — negligible,
  /// but we round down cleanly regardless).
  static const int freeAccountSegmentCapBytes = 1990 * 1024 * 1024; // ~1.99 GB
  static const int premiumAccountSegmentCapBytes = 3990 * 1024 * 1024; // ~3.99 GB

  /// Default segment size TellyBase targets when it must split a file.
  /// Kept below the free-account cap so behaviour never depends on the
  /// signed-in account's Premium status; can be raised in Settings if the
  /// user has Telegram Premium.
  static const int defaultSegmentSizeBytes = freeAccountSegmentCapBytes;

  // ---------------------------------------------------------------------
  // Local caching / cleanup
  // ---------------------------------------------------------------------
  static const int defaultOfflineCacheLimitBytes = 2 * 1024 * 1024 * 1024; // 2 GB
  static const Duration cacheEntryTtl = Duration(days: 14);
  static const Duration autoCleanupInterval = Duration(hours: 6);

  // ---------------------------------------------------------------------
  // Sync / manifest
  // ---------------------------------------------------------------------
  /// TellyBase messages are tagged with this prefix so a channel scan can
  /// instantly recognize TellyBase payloads vs. any other message a user
  /// might post into their own vault chat.
  static const String messageMagic = 'TB1';

  /// How often the consolidated root manifest is re-pinned after local
  /// index changes settle (debounced), instead of after every single file.
  static const Duration manifestFlushDebounce = Duration(seconds: 4);

  /// Number of concurrent upload/download workers.
  static const int maxConcurrentTransfers = 3;

  static const int maxUploadRetries = 8;
  static const Duration retryBaseBackoff = Duration(seconds: 2);
}

/// High-level categories used for gallery/folder grouping & filtering
/// without needing to decrypt full metadata (kept as plaintext enum tag).
enum TellyFileCategory { photo, video, document, audio, other }

extension TellyFileCategoryX on TellyFileCategory {
  String get label => switch (this) {
        TellyFileCategory.photo => 'Photos',
        TellyFileCategory.video => 'Videos',
        TellyFileCategory.document => 'Documents',
        TellyFileCategory.audio => 'Audio',
        TellyFileCategory.other => 'Other',
      };

  String get sfSymbolLike => switch (this) {
        TellyFileCategory.photo => 'photo',
        TellyFileCategory.video => 'video',
        TellyFileCategory.document => 'doc',
        TellyFileCategory.audio => 'music',
        TellyFileCategory.other => 'file',
      };
}
