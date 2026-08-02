import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

import '../constants/app_constants.dart';
import '../crypto/crypto_engine.dart';

/// Describes one encrypted, uploadable piece of a (possibly split) original
/// file. A small file maps to exactly one [FileSegment]; a large file maps
/// to N ordered segments, each of which becomes its own Telegram message.
class FileSegment {
  FileSegment({
    required this.index,
    required this.byteStart,
    required this.byteEnd,
    required this.plainSha256,
    required this.encryptedSizeBytes,
    required this.tempEncryptedPath,
  });

  /// 0-based order of this segment within the original file. Download must
  /// reassemble segments in this order.
  final int index;

  /// Inclusive/exclusive byte range in the *original, unencrypted* file
  /// that this segment represents.
  final int byteStart;
  final int byteEnd;

  /// SHA-256 of this segment's plaintext bytes, used to verify integrity
  /// independently of whether encryption is enabled.
  final String plainSha256;

  final int encryptedSizeBytes;

  /// Path to a temp file holding the (optionally encrypted) bytes ready to
  /// hand to the Telegram uploader. Deleted once the upload confirms.
  final String tempEncryptedPath;

  int get plainSizeBytes => byteEnd - byteStart;
}

/// Bounded-memory streaming window size used both for reading plaintext off
/// disk and, when encryption is enabled, as the size of each independently
/// authenticated AES-256-GCM block. Segments can be up to ~2-4 GB (see
/// [AppConstants.defaultSegmentSizeBytes]) — encrypting/reading a segment
/// in one shot would try to hold the whole thing in RAM, which is not
/// something a phone can do for a multi-gigabyte video. Framing the
/// ciphertext as a sequence of independently-decryptable blocks keeps peak
/// memory usage pinned to this window size regardless of segment size.
const int _streamWindowBytes = 4 * 1024 * 1024; // 4 MiB

/// Splits arbitrarily large files into segments sized to respect Telegram's
/// per-message upload ceiling, optionally encrypting each segment with
/// AES-256-GCM (framed into independently-authenticated blocks) before it
/// ever touches the network, and reassembles them losslessly on download.
///
/// This is a genuinely *streaming* implementation on both read and write
/// paths: at no point does it hold more than [_streamWindowBytes] of file
/// content in memory, whether splitting a 50 GB archive or reconstructing
/// it, keeping behaviour correct even on memory-constrained phones.
class FileChunker {
  FileChunker({CryptoEngine? crypto}) : _crypto = crypto ?? CryptoEngine.instance;

  final CryptoEngine _crypto;
  final _aesGcm = AesGcm.with256bits();

  /// Splits [sourceFile] into one or more [FileSegment]s written under
  /// [workingDir], each no larger than [segmentSizeBytes] (before
  /// encryption/framing overhead). If [encrypt] is true, every segment is
  /// written as a sequence of independently-authenticated AES-256-GCM
  /// blocks using the caller-supplied per-file [contentKey] (derived once
  /// per file from the app's master key + a random file salt, so
  /// compromising one file's key never exposes others).
  Stream<FileChunkerProgress> splitAndPrepare({
    required File sourceFile,
    required Directory workingDir,
    required bool encrypt,
    required SecretKey contentKey,
    int segmentSizeBytes = AppConstants.defaultSegmentSizeBytes,
  }) async* {
    final totalSize = await sourceFile.length();
    final segmentCount = totalSize == 0 ? 1 : (totalSize / segmentSizeBytes).ceil();

    final raf = await sourceFile.open();
    try {
      for (var i = 0; i < segmentCount; i++) {
        final start = i * segmentSizeBytes;
        final end = totalSize == 0 ? 0 : (start + segmentSizeBytes).clamp(0, totalSize);
        final length = end - start;

        await raf.setPosition(start);
        final hasher = _crypto.newStreamingHash();
        final outPath = '${workingDir.path}/seg_${i.toString().padLeft(6, '0')}.part';
        final outFile = File(outPath);
        final sink = outFile.openWrite();

        var remaining = length;
        var encryptedBytesWritten = 0;

        while (remaining > 0) {
          final toRead = remaining < _streamWindowBytes ? remaining : _streamWindowBytes;
          final bytes = await raf.read(toRead);
          if (bytes.isEmpty) break;
          hasher.add(bytes);
          remaining -= bytes.length;

          if (encrypt) {
            final box = await _aesGcm.encrypt(bytes, secretKey: contentKey);
            final framed = _frameBlock(box);
            sink.add(framed);
            encryptedBytesWritten += framed.length;
          } else {
            sink.add(bytes);
            encryptedBytesWritten += bytes.length;
          }
        }

        final plainSha = hasher.close();
        await sink.flush();
        await sink.close();

        yield FileChunkerProgress(
          segment: FileSegment(
            index: i,
            byteStart: start,
            byteEnd: end,
            plainSha256: plainSha,
            encryptedSizeBytes: encryptedBytesWritten,
            tempEncryptedPath: outPath,
          ),
          segmentsDone: i + 1,
          segmentsTotal: segmentCount,
          bytesDone: end,
          bytesTotal: totalSize,
        );
      }
    } finally {
      await raf.close();
    }
  }

  /// Frames one encrypted block as:
  /// `[4-byte big-endian nonce length][nonce][4-byte big-endian ciphertext+tag length][ciphertext][tag]`
  /// so the reconstruction side can read blocks back one at a time without
  /// knowing block boundaries in advance.
  Uint8List _frameBlock(SecretBox box) {
    final nonce = Uint8List.fromList(box.nonce);
    final body = Uint8List.fromList([...box.cipherText, ...box.mac.bytes]);

    final out = BytesBuilder(copy: false);
    out.add(_uint32be(nonce.length));
    out.add(nonce);
    out.add(_uint32be(body.length));
    out.add(body);
    return out.toBytes();
  }

  Uint8List _uint32be(int value) {
    final b = ByteData(4);
    b.setUint32(0, value, Endian.big);
    return b.buffer.asUint8List();
  }

  /// Downloads write each segment to disk as it arrives; this reverses
  /// encryption (if used) and appends plaintext bytes to [destination] in
  /// order, verifying the segment's overall hash *before* it is trusted.
  ///
  /// Decrypted plaintext is first streamed into a sibling temp file (still
  /// in bounded-size windows, never holding the full segment in memory);
  /// only once its hash has been confirmed to match [expectedPlainSha256]
  /// is it appended onto [destination]. This guarantees a checksum failure
  /// never leaves partially-corrupt bytes appended to the file being
  /// reconstructed, which matters because segments are appended in order
  /// and a bad append would silently corrupt everything after it too.
  Future<void> appendDecryptedSegment({
    required File destination,
    required File encryptedSegmentFile,
    required bool wasEncrypted,
    required SecretKey contentKey,
    required String expectedPlainSha256,
  }) async {
    final verifiedTemp = File('${encryptedSegmentFile.path}.verified');
    final hasher = _crypto.newStreamingHash();
    final tempSink = verifiedTemp.openWrite();

    try {
      if (!wasEncrypted) {
        final input = encryptedSegmentFile.openRead();
        await for (final bytes in input) {
          hasher.add(bytes);
          tempSink.add(bytes);
        }
      } else {
        final raf = await encryptedSegmentFile.open();
        try {
          while (true) {
            final nonceLenBytes = await raf.read(4);
            if (nonceLenBytes.isEmpty) break;
            final nonceLen = ByteData.sublistView(Uint8List.fromList(nonceLenBytes)).getUint32(0, Endian.big);
            final nonce = await raf.read(nonceLen);

            final bodyLenBytes = await raf.read(4);
            final bodyLen = ByteData.sublistView(Uint8List.fromList(bodyLenBytes)).getUint32(0, Endian.big);
            final body = await raf.read(bodyLen);

            final tagStart = body.length - 16;
            final cipherText = body.sublist(0, tagStart);
            final tag = body.sublist(tagStart);

            final box = SecretBox(cipherText, nonce: nonce, mac: Mac(tag));
            final plain = await _aesGcm.decrypt(box, secretKey: contentKey);

            hasher.add(plain);
            tempSink.add(plain);
          }
        } finally {
          await raf.close();
        }
      }
    } finally {
      await tempSink.flush();
      await tempSink.close();
    }

    final actualSha = hasher.close();
    if (actualSha != expectedPlainSha256) {
      await verifiedTemp.delete();
      throw FileIntegrityException(
        'Segment checksum mismatch: expected $expectedPlainSha256, got $actualSha. '
        'The download will be retried automatically.',
      );
    }

    // Verified — now stream the confirmed-good plaintext onto the growing
    // destination file and clean up the temp copy.
    final destSink = destination.openWrite(mode: FileMode.append);
    try {
      await for (final bytes in verifiedTemp.openRead()) {
        destSink.add(bytes);
      }
    } finally {
      await destSink.flush();
      await destSink.close();
    }
    await verifiedTemp.delete();
  }
}

class FileChunkerProgress {
  FileChunkerProgress({
    required this.segment,
    required this.segmentsDone,
    required this.segmentsTotal,
    required this.bytesDone,
    required this.bytesTotal,
  });

  final FileSegment segment;
  final int segmentsDone;
  final int segmentsTotal;
  final int bytesDone;
  final int bytesTotal;

  double get fraction => bytesTotal == 0 ? 1.0 : bytesDone / bytesTotal;
}

class FileIntegrityException implements Exception {
  FileIntegrityException(this.message);
  final String message;
  @override
  String toString() => 'FileIntegrityException: $message';
}
