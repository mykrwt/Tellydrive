/// Coarse media classification used across the gallery.
enum MediaType { image, video, other }

/// Classification helpers built on the MIME type plus filename extension.
class MediaClassifier {
  MediaClassifier._();

  static const Set<String> _imageMimes = {
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/bmp',
    'image/tiff',
  };

  static const Set<String> _videoMimes = {
    'video/mp4',
    'video/quicktime',
    'video/x-matroska',
    'video/webm',
    'video/3gpp',
    'video/avi',
    'video/mpeg',
  };

  static const Set<String> _videoExts = {
    'mp4', 'mov', 'mkv', 'webm', '3gp', '3gpp', 'avi', 'm4v', 'mpeg',
  };

  static MediaType of(String? mime, String fileName) {
    final m = mime?.toLowerCase() ?? '';
    if (_imageMimes.contains(m)) return MediaType.image;
    if (_videoMimes.contains(m)) return MediaType.video;

    final dot = fileName.lastIndexOf('.');
    if (dot >= 0 && dot < fileName.length - 1) {
      final ext = fileName.substring(dot + 1).toLowerCase();
      if (_videoExts.contains(ext)) return MediaType.video;
      if (_imageMimes.any((e) => e.endsWith('/$ext'))) return MediaType.image;
    }
    return MediaType.other;
  }
}
