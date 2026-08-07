class UploadRequest {
  const UploadRequest({
    required this.path,
    required this.name,
    required this.size,
    required this.mimeType,
    required this.source,
    this.folderId,
  });
  final String? folderId;
  final String mimeType;
  final String name;
  final String path;
  final int size;
  final String source;
}

class UploadProgress {
  const UploadProgress({
    required this.fileName,
    required this.bytesSent,
    required this.totalBytes,
    required this.part,
    required this.partCount,
  });

  final int bytesSent;
  final String fileName;
  final int part;
  final int partCount;
  final int totalBytes;
  double get fraction => totalBytes <= 0 ? 0 : bytesSent / totalBytes;
}

typedef UploadProgressCallback = void Function(UploadProgress progress);
