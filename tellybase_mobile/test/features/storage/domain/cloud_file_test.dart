import 'package:flutter_test/flutter_test.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_file.dart';

CloudFile file(String name, String mime) => CloudFile(
      id: 'file_123456',
      name: name,
      size: 42,
      mimeType: mime,
      createdAt: DateTime.utc(2026, 8, 7),
    );

void main() {
  test('uses MIME for visual media kinds', () {
    expect(file('photo.bin', 'image/jpeg').kind, CloudFileKind.image);
    expect(file('clip.bin', 'video/mp4').kind, CloudFileKind.video);
  });

  test('falls back to extension for documents and archives', () {
    expect(file('brief.pdf', 'application/octet-stream').kind, CloudFileKind.document);
    expect(file('backup.7z', 'application/octet-stream').kind, CloudFileKind.archive);
  });
}
