import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:tele_drive/services/vault/vault_crypto_service.dart';

void main() {
  group('VaultCryptoService', () {
    test('generateVaultKey, generateSalt, generateNonce produce correct lengths', () {
      final key = VaultCryptoService.instance.generateVaultKey();
      final salt = VaultCryptoService.instance.generateSalt();
      final nonce = VaultCryptoService.instance.generateNonce();

      expect(key.length, 32);
      expect(salt.length, 16);
      expect(nonce.length, 12);
    });

    test('PBKDF2 key derivation is deterministic and produces 32 bytes', () {
      final salt = utf8.encode('test_salt_16bytes');
      final derived1 = VaultCryptoService.instance.deriveKey(
        pin: '1234',
        salt: salt,
        iterations: 100,
      );
      final derived2 = VaultCryptoService.instance.deriveKey(
        pin: '1234',
        salt: salt,
        iterations: 100,
      );
      final derivedOther = VaultCryptoService.instance.deriveKey(
        pin: '9999',
        salt: salt,
        iterations: 100,
      );

      expect(derived1.length, 32);
      expect(derived1, equals(derived2));
      expect(derived1, isNot(equals(derivedOther)));
    });

    test('wrapVaultKey and unwrapVaultKey round-trip with correct PIN', () {
      final vaultKey = VaultCryptoService.instance.generateVaultKey();
      final salt = VaultCryptoService.instance.generateSalt();
      final iv = VaultCryptoService.instance.generateNonce();
      const pin = '43210';

      final wrapped = VaultCryptoService.instance.wrapVaultKey(
        vaultKey: vaultKey,
        pin: pin,
        salt: salt,
        iv: iv,
      );

      expect(wrapped.length, 32);
      expect(wrapped, isNot(equals(vaultKey)));

      final unwrappedCorrect = VaultCryptoService.instance.unwrapVaultKey(
        wrappedKey: wrapped,
        pin: pin,
        salt: salt,
        iv: iv,
      );

      expect(unwrappedCorrect, equals(vaultKey));

      final unwrappedWrong = VaultCryptoService.instance.unwrapVaultKey(
        wrappedKey: wrapped,
        pin: '00000',
        salt: salt,
        iv: iv,
      );

      expect(unwrappedWrong, isNot(equals(vaultKey)));
    });

    test('verification tag validates authentic key and rejects wrong key', () {
      final vaultKey = VaultCryptoService.instance.generateVaultKey();
      final otherKey = VaultCryptoService.instance.generateVaultKey();

      final tag = VaultCryptoService.instance.computeVerifyTag(vaultKey);

      expect(VaultCryptoService.instance.verifyVaultKey(vaultKey, tag), isTrue);
      expect(VaultCryptoService.instance.verifyVaultKey(otherKey, tag), isFalse);
    });

    test('ChaCha20 stream cipher encrypts and decrypts accurately', () {
      final key = List<int>.generate(32, (i) => i);
      final nonce = List<int>.generate(12, (i) => i);
      final plaintext = utf8.encode('Sensitive media file content bytes!');

      final ciphertext = ChaCha20.process(
        key: key,
        nonce: nonce,
        data: plaintext,
      );

      expect(ciphertext.length, plaintext.length);
      expect(ciphertext, isNot(equals(plaintext)));

      final recovered = ChaCha20.process(
        key: key,
        nonce: nonce,
        data: ciphertext,
      );

      expect(recovered, equals(plaintext));
    });
  });
}
