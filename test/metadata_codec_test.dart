import 'package:flutter_test/flutter_test.dart';
import 'package:tellybase/core/error/app_exception.dart';
import 'package:tellybase/features/library/domain/entities/media_item.dart';
import 'package:tellybase/telegram/metadata/metadata_codec.dart';

void main() {
  final item = MediaItem(
    id: 'abc-123',
    fileName: 'IMG_0042.jpg',
    mimeType: 'image/jpeg',
    size: 4829382,
    uploadedAt: DateTime.fromMillisecondsSinceEpoch(1690000000000),
    capturedAt: DateTime.fromMillisecondsSinceEpoch(1690000000000),
    firstMessageId: 100,
    chunkMessageIds: [100, 101, 102],
    albumId: 'album-1',
    albumName: 'Trip 2023',
    favorite: true,
    trashed: false,
  );

  test('item round-trips through the codec', () {
    final caption = MetadataCodec.encodeItem(item);
    expect(MetadataCodec.isOurs(caption), isTrue);

    final decoded = MetadataCodec.decodeItem(caption);
    expect(decoded.id, item.id);
    expect(decoded.fileName, 'IMG_0042.jpg');
    expect(decoded.mimeType, 'image/jpeg');
    expect(decoded.size, 4829382);
    expect(decoded.firstMessageId, 100);
    expect(decoded.chunkMessageIds, [100, 101, 102]);
    expect(decoded.albumId, 'album-1');
    expect(decoded.albumName, 'Trip 2023');
    expect(decoded.favorite, isTrue);
    expect(decoded.trashed, isFalse);
  });

  test('single-chunk items reconstruct their message id list', () {
    final single = item.withMessageIds(100, const []);
    final caption = MetadataCodec.encodeItem(single);
    // Even without the manifest, `first` is preserved and used.
    expect(MetadataCodec.decodeItem(caption).firstMessageId, 100);
  });

  test('foreign captions are rejected', () {
    expect(MetadataCodec.isOurs('hello world'), isFalse);
    expect(() => MetadataCodec.decodeItem('hello world'),
        throwsA(isA<MetadataException>()));
  });

  test('part records are not items', () {
    final caption = MetadataCodec.encodePart(itemId: 'x', index: 1);
    expect(MetadataCodec.isOurs(caption), isTrue);
    expect(() => MetadataCodec.decodeItem(caption),
        throwsA(isA<MetadataException>()));
  });

  test('malformed JSON throws a MetadataException', () {
    expect(() => MetadataCodec.decodeItem('__tellybase:not-json'),
        throwsA(isA<MetadataException>()));
  });
}
