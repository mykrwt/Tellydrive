import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

/// Professional cryptographic service for TeleDrive's Hidden Vault.
///
/// Implements:
/// - RFC 8439 ChaCha20 stream cipher (256-bit key, 96-bit nonce) for high speed,
///   zero-dependency media encryption and key wrapping.
/// - RFC 2898 PBKDF2-HMAC-SHA256 (10,000 iterations) for secure key derivation
///   from the user's PIN/password.
/// - Cryptographically secure random generation for keys, salts, and nonces.
/// - Verification tags using HMAC-SHA256 so incorrect PINs fail cleanly.
class VaultCryptoService {
  VaultCryptoService._();
  static final VaultCryptoService instance = VaultCryptoService._();

  static const int keyLengthBytes = 32; // 256 bits
  static const int saltLengthBytes = 16; // 128 bits
  static const int nonceLengthBytes = 12; // 96 bits
  static const int pbkdf2Iterations = 10000;
  static const String verifyLabel = 'TELEDRIVE_VAULT_KEY_V1';

  final math.Random _secureRandom = math.Random.secure();

  /// Generates a cryptographically secure random 32-byte Vault Encryption Key.
  List<int> generateVaultKey() => _randomBytes(keyLengthBytes);

  /// Generates a cryptographically secure random 16-byte salt.
  List<int> generateSalt() => _randomBytes(saltLengthBytes);

  /// Generates a cryptographically secure random 12-byte nonce (IV).
  List<int> generateNonce() => _randomBytes(nonceLengthBytes);

  List<int> _randomBytes(int length) {
    return List<int>.generate(length, (_) => _secureRandom.nextInt(256));
  }

  /// Derives a 32-byte wrapping key from [pin] and [salt] using PBKDF2-HMAC-SHA256.
  List<int> deriveKey({
    required String pin,
    required List<int> salt,
    int iterations = pbkdf2Iterations,
    int keyLength = keyLengthBytes,
  }) {
    final passwordBytes = utf8.encode(pin);
    final hmac = Hmac(sha256, passwordBytes);

    final blocks = (keyLength + 31) ~/ 32;
    final output = Uint8List(keyLength);
    var offset = 0;

    for (var i = 1; i <= blocks; i++) {
      final blockIndexBytes = Uint8List(4)
        ..buffer.asByteData().setUint32(0, i, Endian.big);
      final initialInput = Uint8List.fromList([...salt, ...blockIndexBytes]);

      var u = hmac.convert(initialInput).bytes;
      final t = Uint8List.fromList(u);

      for (var iter = 1; iter < iterations; iter++) {
        u = hmac.convert(u).bytes;
        for (var k = 0; k < t.length; k++) {
          t[k] ^= u[k];
        }
      }

      final bytesToCopy = (keyLength - offset < 32) ? keyLength - offset : 32;
      for (var j = 0; j < bytesToCopy; j++) {
        output[offset + j] = t[j];
      }
      offset += bytesToCopy;
    }

    return output;
  }

  /// Computes a verification tag for a Vault Key so PIN validity can be verified
  /// without storing or exposing the PIN or the Vault Key itself.
  String computeVerifyTag(List<int> vaultKey) {
    final hmac = Hmac(sha256, vaultKey);
    final digest = hmac.convert(utf8.encode(verifyLabel));
    return base64Encode(digest.bytes);
  }

  /// True if [candidateVaultKey] matches [expectedTagBase64].
  ///
  /// Compares the raw tag bytes in constant time so a wrong-PIN rejection
  /// doesn't leak how many leading bytes matched (timing side channel).
  bool verifyVaultKey(List<int> candidateVaultKey, String expectedTagBase64) {
    try {
      final computed = base64Decode(computeVerifyTag(candidateVaultKey));
      final expected = base64Decode(expectedTagBase64);
      if (computed.length != expected.length) return false;
      var difference = 0;
      for (var i = 0; i < computed.length; i++) {
        difference |= computed[i] ^ expected[i];
      }
      return difference == 0;
    } catch (_) {
      return false;
    }
  }

  /// Wraps (encrypts) the [vaultKey] using a key derived from [pin] + [salt].
  List<int> wrapVaultKey({
    required List<int> vaultKey,
    required String pin,
    required List<int> salt,
    required List<int> iv,
  }) {
    final wrappingKey = deriveKey(pin: pin, salt: salt);
    return ChaCha20.process(
      key: wrappingKey,
      nonce: iv,
      data: vaultKey,
      initialCounter: 1,
    );
  }

  /// Unwraps (decrypts) the [wrappedKey] using a key derived from [pin] + [salt].
  List<int> unwrapVaultKey({
    required List<int> wrappedKey,
    required String pin,
    required List<int> salt,
    required List<int> iv,
  }) {
    final wrappingKey = deriveKey(pin: pin, salt: salt);
    return ChaCha20.process(
      key: wrappingKey,
      nonce: iv,
      data: wrappedKey,
      initialCounter: 1,
    );
  }

  /// Encrypts an original media file [source] to [destination] using ChaCha20
  /// with [vaultKey] and [nonce]. Streams in 64 KB chunks so RAM usage remains
  /// minimal even for large videos.
  Future<void> encryptFile({
    required File source,
    required File destination,
    required List<int> vaultKey,
    required List<int> nonce,
    void Function(double progress)? onProgress,
  }) async {
    await _streamCipherFile(
      source: source,
      destination: destination,
      key: vaultKey,
      nonce: nonce,
      onProgress: onProgress,
    );
  }

  /// Decrypts a `.tdvault` file [source] to [destination] using ChaCha20.
  Future<void> decryptFile({
    required File source,
    required File destination,
    required List<int> vaultKey,
    required List<int> nonce,
    void Function(double progress)? onProgress,
  }) async {
    await _streamCipherFile(
      source: source,
      destination: destination,
      key: vaultKey,
      nonce: nonce,
      onProgress: onProgress,
    );
  }

  Future<void> _streamCipherFile({
    required File source,
    required File destination,
    required List<int> key,
    required List<int> nonce,
    void Function(double progress)? onProgress,
  }) async {
    final parent = destination.parent;
    if (!await parent.exists()) {
      await parent.create(recursive: true);
    }

    final totalSize = await source.length();
    final input = await source.open(mode: FileMode.read);
    IOSink? sink;
    try {
      sink = destination.openWrite();
      const int chunkSize = 65536; // 64 KB = exactly 1024 ChaCha20 blocks
      int bytesProcessed = 0;
      int blockCounter = 1;

      while (bytesProcessed < totalSize) {
        final toRead = math.min(chunkSize, totalSize - bytesProcessed);
        final chunk = await input.read(toRead);
        if (chunk.isEmpty) break;

        final processed = ChaCha20.process(
          key: key,
          nonce: nonce,
          data: chunk,
          initialCounter: blockCounter,
        );

        sink.add(processed);
        bytesProcessed += chunk.length;
        // Each 64 bytes is 1 block in ChaCha20 counter.
        blockCounter += (chunk.length + 63) ~/ 64;

        if (totalSize > 0) {
          onProgress?.call((bytesProcessed / totalSize).clamp(0.0, 1.0).toDouble());
        }
      }
      await sink.flush();
      await sink.close();
      sink = null;
      if (totalSize > 0) onProgress?.call(1.0);
    } catch (_) {
      if (sink != null) {
        await sink.close();
      }
      if (await destination.exists()) {
        await destination.delete();
      }
      rethrow;
    } finally {
      await input.close();
    }
  }
}

/// Standard RFC 8439 ChaCha20 stream cipher in pure Dart.
class ChaCha20 {
  static const List<int> _constants = [
    0x61707865,
    0x3320646e,
    0x79622d32,
    0x6b206574,
  ];

  static Uint8List process({
    required List<int> key,
    required List<int> nonce,
    required List<int> data,
    int initialCounter = 1,
  }) {
    if (key.length != 32) {
      throw ArgumentError('ChaCha20 key must be 32 bytes.');
    }
    if (nonce.length != 12) {
      throw ArgumentError('ChaCha20 nonce must be 12 bytes.');
    }

    final keyView = ByteData.sublistView(Uint8List.fromList(key));
    final nonceView = ByteData.sublistView(Uint8List.fromList(nonce));

    final state = Uint32List(16);
    state[0] = _constants[0];
    state[1] = _constants[1];
    state[2] = _constants[2];
    state[3] = _constants[3];

    for (var i = 0; i < 8; i++) {
      state[4 + i] = keyView.getUint32(i * 4, Endian.little);
    }
    for (var i = 0; i < 3; i++) {
      state[13 + i] = nonceView.getUint32(i * 4, Endian.little);
    }

    final output = Uint8List(data.length);
    final block = Uint8List(64);
    final blockView = ByteData.sublistView(block);

    var counter = initialCounter & 0xFFFFFFFF;
    var offset = 0;

    while (offset < data.length) {
      state[12] = counter;
      _generateBlock(state, blockView);

      final chunkLength =
          (data.length - offset < 64) ? data.length - offset : 64;
      for (var i = 0; i < chunkLength; i++) {
        output[offset + i] = data[offset + i] ^ block[i];
      }

      offset += chunkLength;
      counter = (counter + 1) & 0xFFFFFFFF;
    }

    return output;
  }

  static void _generateBlock(Uint32List state, ByteData outView) {
    final working = Uint32List.fromList(state);
    for (var i = 0; i < 10; i++) {
      _qr(working, 0, 4, 8, 12);
      _qr(working, 1, 5, 9, 13);
      _qr(working, 2, 6, 10, 14);
      _qr(working, 3, 7, 11, 15);
      _qr(working, 0, 5, 10, 15);
      _qr(working, 1, 6, 11, 12);
      _qr(working, 2, 7, 8, 13);
      _qr(working, 3, 4, 9, 14);
    }
    for (var i = 0; i < 16; i++) {
      final val = (working[i] + state[i]) & 0xFFFFFFFF;
      outView.setUint32(i * 4, val, Endian.little);
    }
  }

  static void _qr(Uint32List s, int a, int b, int c, int d) {
    s[a] = (s[a] + s[b]) & 0xFFFFFFFF;
    s[d] = _rotl32(s[d] ^ s[a], 16);
    s[c] = (s[c] + s[d]) & 0xFFFFFFFF;
    s[b] = _rotl32(s[b] ^ s[c], 12);
    s[a] = (s[a] + s[b]) & 0xFFFFFFFF;
    s[d] = _rotl32(s[d] ^ s[a], 8);
    s[c] = (s[c] + s[d]) & 0xFFFFFFFF;
    s[b] = _rotl32(s[b] ^ s[c], 7);
  }

  static int _rotl32(int a, int b) {
    a &= 0xFFFFFFFF;
    return ((a << b) & 0xFFFFFFFF) | ((a & 0xFFFFFFFF) >> (32 - b));
  }
}
