import 'package:flutter_test/flutter_test.dart';
import 'package:tele_drive/services/vault/vault_metadata.dart';

void main() {
  test('vault metadata caption round trips all recovery and encryption parameters', () {
    final now = DateTime.utc(2026, 8, 10, 12, 0, 0);
    final source = VaultMetadata(
      version: 1,
      uploadId: '3d2367f8-49a1-45a4-b03f-ae098af8c707',
      originalName: 'secret_photo 🔐.jpg',
      originalSize: 409600,
      mimeType: 'image/jpeg',
      salt: 'c2FsdF9zYWx0X3NhbHRfc2E=',
      wrappedKey: 'd3JhcHBlZF9rZXlfd3JhcHBlZF9rZXlfMzJfYnl0ZXM=',
      wrapIv: 'd3JhcF9pdl8xMmJ5dGVz',
      mediaIv: 'bWVkaWFfaXZfMTJieXRlcw==',
      verifyTag: 'dmVyaWZ5X3RhZ18zMl9ieXRlc19obWFj',
      uploadedAt: now,
    );

    final caption = source.toCaption();
    expect(caption.startsWith(VaultMetadata.captionPrefix), isTrue);

    final decoded = VaultMetadata.tryParseCaption(caption);
    expect(decoded, isNotNull);
    expect(decoded!.version, 1);
    expect(decoded.uploadId, source.uploadId);
    expect(decoded.originalName, source.originalName);
    expect(decoded.originalSize, source.originalSize);
    expect(decoded.mimeType, source.mimeType);
    expect(decoded.salt, source.salt);
    expect(decoded.wrappedKey, source.wrappedKey);
    expect(decoded.wrapIv, source.wrapIv);
    expect(decoded.mediaIv, source.mediaIv);
    expect(decoded.verifyTag, source.verifyTag);
    expect(decoded.uploadedAt.millisecondsSinceEpoch, now.millisecondsSinceEpoch);
  });

  test('invalid and non-vault captions return null', () {
    expect(VaultMetadata.tryParseCaption('random caption'), isNull);
    expect(VaultMetadata.tryParseCaption(''), isNull);
    expect(
      VaultMetadata.tryParseCaption('${VaultMetadata.captionPrefix}{"v":1}'),
      isNull,
    );
  });
}
