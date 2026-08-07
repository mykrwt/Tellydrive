import 'dart:convert';

import '../../core/config/app_config.dart';
import '../../core/error/app_exception.dart';
import '../../features/library/domain/entities/media_item.dart';

/// Encodes/decodes TellyBase metadata as Telegram message captions.
///
/// Every caption we write is prefixed with a marker so the indexer can skip
/// unrelated messages that might share the Saved Messages chat. The payload is
/// compact JSON that stays far below Telegram's 1024-char caption limit.
class MetadataCodec {
  const MetadataCodec._();

  static const String _prefix = '${AppConfig.metadataMarker}:';

  /// True when a message caption carries TellyBase metadata.
  static bool isOurs(String? caption) => caption?.startsWith(_prefix) ?? false;

  /// Builds the caption for chunk 0 of [item]. This is the authoritative record
  /// (filename, mime, size, times, album, flags and the chunk manifest).
  static String encodeItem(MediaItem item) {
    final json = jsonEncode(item.toMetadataJson());
    return '$_prefix$json';
  }

  /// Minimal caption for a non-first chunk part. Contains just enough to keep
  /// it identifiable, but it is never surfaced as a standalone item.
  static String encodePart({required String itemId, required int index}) {
    final json = jsonEncode({
      'v': AppConfig.metadataVersion,
      't': 'part',
      'id': itemId,
      'p': index,
    });
    return '$_prefix$json';
  }

  /// Decodes a caption into a [MediaItem]. Throws [MetadataException] for
  /// malformed or non-item records.
  static MediaItem decodeItem(String caption) {
    if (!isOurs(caption)) {
      throw MetadataException('Not a TellyBase caption.');
    }
    final raw = caption.substring(_prefix.length);
    final Object? decoded;
    try {
      decoded = jsonDecode(raw);
    } on FormatException catch (e) {
      throw MetadataException('Caption is not valid JSON.', cause: e);
    }
    if (decoded is! Map<String, dynamic>) {
      throw MetadataException('Caption JSON is not an object.');
    }
    if (decoded['t'] != 'item') {
      throw MetadataException('Caption is a "${decoded['t']}" record, not an item.');
    }
    if ((decoded['v'] as int? ?? 0) > AppConfig.metadataVersion) {
      throw MetadataException(
        'Caption schema v${decoded['v']} is newer than supported.',
      );
    }
    try {
      return MediaItem.fromMetadata(decoded);
    } on Object catch (e) {
      throw MetadataException('Malformed item metadata.', cause: e);
    }
  }
}
