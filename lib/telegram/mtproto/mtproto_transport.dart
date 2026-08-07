// ignore_for_file: avoid_dynamic_calls
//
// STUB implementation (telegram_client package removed due to incompatibility
// with current Dart/Flutter SDKs and breaking API changes).
//
// This file now provides a no-op stub that satisfies the type signatures
// used by the rest of the app. Real MTProto will be restored when a compatible
// pure-Dart client (or custom implementation) is integrated.
//
// All public methods either return dummy values or throw a clear
// TelegramException so the UI can surface "Telegram integration disabled".
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:io';

import '../../core/config/app_config.dart';
import '../../core/error/app_exception.dart';

/// A single Telegram message as surfaced to the storage adapter: its id and
/// caption plus (when present) the media access handle used to download bytes.
class TgMessage {
  const TgMessage({required this.id, required this.caption, this.fileRef});

  final int id;
  final String? caption;

  /// Opaque file location for media download (InputFileLocation).
  final dynamic fileRef;
}

/// Thin wrapper that owns the [TelegramClient] lifecycle and exposes the exact
/// handful of operations TellyBase needs. All public methods already return
/// TellyBase types so the rest of the app never sees MTProto objects.
///
/// CURRENTLY STUBBED — telegram_client dependency was removed because of
/// repeated build failures (API drift, missing types, Dart/Flutter SDK
/// incompatibility).  Real MTProto logic will be re-introduced later.
class MtprotoTransport {
  MtprotoTransport({required int apiId, required String apiHash});

  bool _connected = false;
  bool get isConnected => _connected;

  static int _selfPeer(int userId) => userId;

  Future<void> connect({String? session}) async {
    // STUB: pretend we are connected so the rest of the app boots.
    _connected = true;
  }

  String exportSession() => '';

  Future<void> disconnect() async {
    _connected = false;
  }

  Future<void> logOut() async {}

  // ── Authentication (stub) ────────────────────────────────────────────────

  Future<({String hash, bool viaApp, int? timeout})> sendCode(String phone) async {
    throw const TelegramException('Telegram MTProto client is currently disabled (stub).');
  }

  Future<void> signIn({
    required String phone,
    required String code,
    required String hash,
  }) async {
    throw const TelegramException('Telegram MTProto client is currently disabled (stub).');
  }

  Future<bool> needsPassword() async => false;

  Future<void> checkPassword(String password) async {
    throw const TelegramException('Telegram MTProto client is currently disabled (stub).');
  }

  Future<int> getMe() async {
    // Return a harmless fake id so the app can continue without crashing in
    // non-authenticated flows.
    return 0;
  }

  Future<String> getFirstName() async => '';

  // ── History ──────────────────────────────────────────────────────────────

  Future<void> forEachHistoryMessage({
    required int userId,
    required Future<void> Function(TgMessage message) onMessage,
  }) async {
    // no-op in stub
  }

  // ── Upload / Edit / Delete ───────────────────────────────────────────────

  Future<int> sendDocumentChunk({
    required int userId,
    required String filePath,
    required String fileName,
    required String mime,
    required String caption,
  }) async {
    throw const TelegramException('Telegram MTProto client is currently disabled (stub).');
  }

  Future<void> editCaption({
    required int userId,
    required int messageId,
    required String caption,
  }) async {
    throw const TelegramException('Telegram MTProto client is currently disabled (stub).');
  }

  Future<void> deleteMessages({
    required int userId,
    required List<int> messageIds,
  }) async {
    // no-op
  }

  Future<TgMessage?> getMessageById(int userId, int messageId) async => null;

  Future<File> downloadMessageMedia({
    required int userId,
    required int messageId,
    required String destination,
    void Function(int done, int total)? onProgress,
  }) async {
    throw const TelegramException('Telegram MTProto client is currently disabled (stub).');
  }

  Future<File> downloadMedia({
    required TgMessage message,
    required String destination,
    void Function(int done, int total)? onProgress,
  }) async {
    throw const TelegramException('Telegram MTProto client is currently disabled (stub).');
  }
}
