import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:crypto/crypto.dart' as pkg_crypto;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// TellyBase's single source of truth for every cryptographic operation:
///
///   • Deriving/holding the device master key (kept in the OS secure
///     enclave / keystore via `flutter_secure_storage`, never in Telegram).
///   • Encrypting the *local* metadata index (SQLite is stored as an
///     encrypted blob — see [LocalIndexCrypto]).
///   • Optionally encrypting file bytes end-to-end *before* they are ever
///     handed to the Telegram upload pipeline, so — if the user opts in —
///     Telegram only ever sees ciphertext.
///   • Computing SHA-256 checksums used for integrity verification of every
///     chunk and of the reconstructed original file.
///
/// Algorithm choices:
///   • AES-256-GCM for both metadata and file payloads: authenticated
///     encryption, hardware-accelerated on virtually every phone, and a
///     single 16-byte tag gives us tamper-evidence per chunk for free.
///   • A random 96-bit nonce per encryption call (GCM's recommended nonce
///     size), stored alongside the ciphertext — nonces are not secret.
///   • Master key: 256-bit, generated once on first launch with a CSPRNG
///     and stored only in the platform secure keystore. A user-visible
///     "Recovery Key" (BIP39-style words derived from the same bytes) can
///     be exported so metadata can be decrypted again on a fresh device
///     even before Telegram sync restores a copy of the wrapped key.
class CryptoEngine {
  CryptoEngine._();
  static final CryptoEngine instance = CryptoEngine._();

  static const _secureStorage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  static const _masterKeyStorageKey = 'tellybase.master_key.v1';

  final _aesGcm = AesGcm.with256bits();
  SecretKey? _cachedMasterKey;

  /// Returns the persistent device master key, generating and persisting a
  /// new one on first run. This key never leaves the device unencrypted;
  /// see [wrapMasterKeyForBackup] for how it is escrowed inside the user's
  /// own Telegram vault so a *new* device can recover it (protected by the
  /// user's TellyBase passphrase / Telegram cloud password).
  Future<SecretKey> getOrCreateMasterKey() async {
    if (_cachedMasterKey != null) return _cachedMasterKey!;

    final existing = await _secureStorage.read(key: _masterKeyStorageKey);
    if (existing != null) {
      final bytes = base64Decode(existing);
      _cachedMasterKey = SecretKey(bytes);
      return _cachedMasterKey!;
    }

    final newKey = await _aesGcm.newSecretKey();
    final bytes = await newKey.extractBytes();
    await _secureStorage.write(
      key: _masterKeyStorageKey,
      value: base64Encode(bytes),
    );
    _cachedMasterKey = newKey;
    return newKey;
  }

  /// Overwrites the local master key (used when restoring from a recovery
  /// phrase / escrow blob pulled from the user's Telegram vault on a new
  /// device).
  Future<void> installMasterKey(Uint8List rawKeyBytes) async {
    await _secureStorage.write(
      key: _masterKeyStorageKey,
      value: base64Encode(rawKeyBytes),
    );
    _cachedMasterKey = SecretKey(rawKeyBytes);
  }

  Future<Uint8List> exportRawMasterKey() async {
    final key = await getOrCreateMasterKey();
    return Uint8List.fromList(await key.extractBytes());
  }

  /// Derives a per-purpose sub-key from the master key using HKDF, so the
  /// key used to encrypt the local metadata DB is cryptographically
  /// distinct from the key used to encrypt file contents, even though both
  /// trace back to one master secret the user only has to protect once.
  Future<SecretKey> _deriveSubKey(String purpose) async {
    final master = await getOrCreateMasterKey();
    final hkdf = Hkdf(hmac: Hmac.sha256(), outputLength: 32);
    return hkdf.deriveKey(
      secretKey: master,
      info: utf8.encode('tellybase:$purpose'),
    );
  }

  Future<SecretKey> metadataKey() => _deriveSubKey('metadata-index');
  Future<SecretKey> fileContentKey() => _deriveSubKey('file-content');

  /// Encrypts [plainBytes] with AES-256-GCM under [key]. Returns a
  /// self-describing envelope: `[12-byte nonce][ciphertext][16-byte tag]`.
  Future<Uint8List> encryptBytes(Uint8List plainBytes, SecretKey key) async {
    final nonce = _aesGcm.newNonce();
    final box = await _aesGcm.encrypt(
      plainBytes,
      secretKey: key,
      nonce: nonce,
    );
    return Uint8List.fromList([...nonce, ...box.cipherText, ...box.mac.bytes]);
  }

  /// Reverses [encryptBytes].
  Future<Uint8List> decryptBytes(Uint8List envelope, SecretKey key) async {
    final nonce = envelope.sublist(0, 12);
    final tag = envelope.sublist(envelope.length - 16);
    final cipherText = envelope.sublist(12, envelope.length - 16);
    final box = SecretBox(cipherText, nonce: nonce, mac: Mac(tag));
    final clear = await _aesGcm.decrypt(box, secretKey: key);
    return Uint8List.fromList(clear);
  }

  /// SHA-256 checksum, used for: per-chunk integrity, whole-file integrity
  /// after reconstruction, and incremental-backup change detection (a file
  /// whose hash hasn't changed is skipped even if mtime changed).
  String sha256Hex(Uint8List bytes) => pkg_crypto.sha256.convert(bytes).toString();

  /// Streaming SHA-256 accumulator so hashing a huge file never requires
  /// holding it fully in memory. Feed chunks via [StreamingHash.add] and
  /// call [StreamingHash.close] to get the final hex digest.
  StreamingHash newStreamingHash() => StreamingHash._();

  String randomHex(int bytesLen) {
    final rnd = Random.secure();
    final bytes = List<int>.generate(bytesLen, (_) => rnd.nextInt(256));
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }
}

/// Thin wrapper around `package:crypto`'s incremental SHA-256 sink so
/// callers don't need to reach into `pkg_crypto` directly.
class StreamingHash {
  StreamingHash._() {
    _sink = pkg_crypto.AccumulatorSink<pkg_crypto.Digest>();
    _input = pkg_crypto.sha256.startChunkedConversion(_sink);
  }

  late final pkg_crypto.AccumulatorSink<pkg_crypto.Digest> _sink;
  late final ByteConversionSink _input;

  void add(List<int> bytes) => _input.add(bytes);

  String close() {
    _input.close();
    return _sink.events.single.toString();
  }
}
