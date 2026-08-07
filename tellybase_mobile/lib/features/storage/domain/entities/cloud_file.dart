enum CloudFileKind { image, video, audio, archive, document, code, other }

class CloudFile {
  const CloudFile({
    required this.id,
    required this.name,
    required this.size,
    required this.mimeType,
    required this.createdAt,
    this.updatedAt,
    this.chunked = false,
    this.folderId,
    this.favorite = false,
    this.hasThumbnail = false,
    this.width,
    this.height,
    this.duration,
  });

  final bool chunked;
  final DateTime createdAt;
  final double? duration;
  final bool favorite;
  final String? folderId;
  final bool hasThumbnail;
  final double? height;
  final String id;
  final String mimeType;
  final String name;
  final int size;
  final DateTime? updatedAt;
  final double? width;

  String get extension {
    final dot = name.lastIndexOf('.');
    return dot > 0 && dot < name.length - 1
        ? name.substring(dot + 1).toLowerCase()
        : '';
  }

  CloudFileKind get kind {
    if (mimeType.startsWith('image/')) return CloudFileKind.image;
    if (mimeType.startsWith('video/')) return CloudFileKind.video;
    if (mimeType.startsWith('audio/')) return CloudFileKind.audio;
    if (_archives.contains(extension)) return CloudFileKind.archive;
    if (_audio.contains(extension)) return CloudFileKind.audio;
    if (_code.contains(extension)) return CloudFileKind.code;
    if (_documents.contains(extension)) return CloudFileKind.document;
    return CloudFileKind.other;
  }

  bool get isMedia =>
      kind == CloudFileKind.image || kind == CloudFileKind.video;

  CloudFile copyWith({
    String? name,
    String? folderId,
    bool clearFolder = false,
    bool? favorite,
  }) =>
      CloudFile(
        id: id,
        name: name ?? this.name,
        size: size,
        mimeType: mimeType,
        createdAt: createdAt,
        updatedAt: updatedAt,
        chunked: chunked,
        folderId: clearFolder ? null : folderId ?? this.folderId,
        favorite: favorite ?? this.favorite,
        hasThumbnail: hasThumbnail,
        width: width,
        height: height,
        duration: duration,
      );

  static const _archives = <String>{
    'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'iso', 'dmg', 'apk',
  };
  static const _audio = <String>{
    'mp3', 'wav', 'ogg', 'opus', 'flac', 'aac', 'm4a', 'wma', 'aiff', 'mid',
  };
  static const _code = <String>{
    'js', 'ts', 'jsx', 'tsx', 'py', 'html', 'css', 'json', 'sql', 'sh', 'rs',
    'go', 'cpp', 'c', 'java', 'php', 'yaml', 'yml', 'xml',
  };
  static const _documents = <String>{
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv',
    'md', 'log', 'odt', 'ods', 'odp', 'epub', 'mobi', 'ics', 'vcf', 'srt',
  };
}
