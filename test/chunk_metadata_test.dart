import 'package:flutter_test/flutter_test.dart';
import 'package:tele_drive/services/transfers/chunk_metadata.dart';

void main() {
  test('chunk caption round trips all reconstruction metadata', () {
    const source = ChunkMetadata(
      role: ChunkMetadata.chunkRole,
      uploadId: '3d2367f8-49a1-45a4-b03f-ae098af8c707',
      originalName: 'holiday video 🎬.mp4',
      originalSize: 8589934593,
      mimeType: 'video/mp4',
      chunkCount: 5,
      chunkIndex: 3,
    );

    final decoded = ChunkMetadata.tryParseCaption(source.toCaption());
    expect(decoded, isNotNull);
    expect(decoded!.role, ChunkMetadata.chunkRole);
    expect(decoded.uploadId, source.uploadId);
    expect(decoded.originalName, source.originalName);
    expect(decoded.originalSize, source.originalSize);
    expect(decoded.mimeType, source.mimeType);
    expect(decoded.chunkCount, source.chunkCount);
    expect(decoded.chunkIndex, source.chunkIndex);
  });

  test('manifest caption round trips without an index', () {
    const source = ChunkMetadata(
      role: ChunkMetadata.manifestRole,
      uploadId: 'upload-id',
      originalName: 'archive.tar',
      originalSize: 10,
      mimeType: 'application/x-tar',
      chunkCount: 2,
    );

    final decoded = ChunkMetadata.tryParseCaption(source.toCaption());
    expect(decoded, isNotNull);
    expect(decoded!.isManifest, isTrue);
    expect(decoded.chunkIndex, isNull);
  });

  test('invalid and unrelated captions are ignored', () {
    expect(ChunkMetadata.tryParseCaption('hello'), isNull);
    expect(
      ChunkMetadata.tryParseCaption('${ChunkMetadata.captionPrefix}{"r":"c"}'),
      isNull,
    );
  });
}
