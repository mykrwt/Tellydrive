import 'package:flutter/foundation.dart';

/// Base class for all typed application failures.
@immutable
sealed class AppException implements Exception {
  const AppException(this.message, {this.cause});

  final String message;
  final Object? cause;

  @override
  String toString() =>
      '${runtimeType.toString()}: $message${cause == null ? '' : ' ($cause)'}';
}

/// Something went wrong talking to Telegram (network, RPC error, flood wait…).
class TelegramException extends AppException {
  const TelegramException(super.message, {super.cause});
}

/// The Telegram RPC returned a typed error code (e.g. PHONE_CODE_INVALID).
class RpcException extends TelegramException {
  const RpcException(this.code, String message, {super.cause})
      : super(message);

  final String code;

  bool get isFloodWait => code == 'FLOOD_WAIT';
  bool get isMigrate => code.contains('MIGRATE');
  bool get isPasswordNeeded => code == 'SESSION_PASSWORD_NEEDED';
  bool get isPhoneNotRegistered => code == 'PHONE_NUMBER_UNREGISTERED';
  bool get isCodeInvalid => code == 'PHONE_CODE_INVALID';
  bool get isCodeExpired => code == 'PHONE_CODE_EXPIRED';
  bool get isPasswordInvalid =>
      code == 'PASSWORD_HASH_INVALID' || code == 'SRP_ID_INVALID';
}

/// Raised when a chunked file cannot be reconstructed (missing/invalid parts).
class ChunkedFileException extends AppException {
  const ChunkedFileException(super.message, {super.cause});
}

/// Raised when the user is not authenticated but an authenticated call is made.
class NotAuthenticatedException extends AppException {
  const NotAuthenticatedException()
      : super('You are not signed in. Please log in first.');
}

/// A local IO failure (cache, storage, disk).
class LocalStorageException extends AppException {
  const LocalStorageException(super.message, {super.cause});
}

/// Thrown when metadata in a caption is malformed or belongs to another schema.
class MetadataException extends AppException {
  const MetadataException(super.message, {super.cause});
}
