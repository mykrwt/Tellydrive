import 'dart:async';
import 'package:flutter/services.dart';

/// Dart-side wrapper for the Kotlin TelegramPlugin.
///
/// Method channel: 'dev.aliabdollahzadeh.teledrive/telegram'
/// Event channel:  'dev.aliabdollahzadeh.teledrive/telegram_events'
class NativeTelegramChannel {
  NativeTelegramChannel._();

  static const _method =
      MethodChannel('dev.aliabdollahzadeh.teledrive/telegram');
  static const _events =
      EventChannel('dev.aliabdollahzadeh.teledrive/telegram_events');

  // Singleton broadcast stream — avoids multiple native listeners
  static Stream<Map<String, dynamic>>? _broadcastStream;
  static Stream<Map<String, dynamic>> get _stream {
    _broadcastStream ??= _events
        .receiveBroadcastStream()
        .map((e) => Map<String, dynamic>.from(e as Map))
        .asBroadcastStream();
    return _broadcastStream!;
  }

  // Stream of auth state events from TDLib
  static Stream<Map<String, dynamic>> get authStateStream => _stream.where(
      (event) => event['type'] == 'authState' || event['type'] == 'error');

  // Stream of file download updates from TDLib
  static Stream<Map<String, dynamic>> get fileUpdateStream => _stream
      .where((event) => event['type'] == 'fileUpdate')
      .map((event) => Map<String, dynamic>.from(event['file'] as Map));

  /// Initialize TDLib.
  ///
  /// Telegram API credentials are stored on the Android native side
  /// and injected through BuildConfig. Flutter must not send apiId/apiHash.
  static Future<void> initialize() async {
    try {
      await _method.invokeMethod('initialize');
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Ask Telegram to send the verification code to the user's Telegram app.
  static Future<void> sendPhoneNumber(String phone) async {
    try {
      await _method.invokeMethod('sendPhoneNumber', {'phone': phone});
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Submit the verification code the user received.
  static Future<void> checkCode(String code) async {
    try {
      await _method.invokeMethod('checkCode', {'code': code});
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Submit the two-step verification password.
  static Future<void> checkPassword(String password) async {
    try {
      await _method.invokeMethod('checkPassword', {'password': password});
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Log out from Telegram.
  static Future<void> logout() async {
    try {
      await _method.invokeMethod('logout');
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Get the current user profile (including phone number).
  static Future<Map<String, dynamic>> getMe() async {
    try {
      final result = await _method.invokeMapMethod<String, dynamic>('getMe');
      return result ?? {};
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Get list of all chats (Saved Messages, channels, groups, etc.)
  static Future<List<Map<String, dynamic>>> getMyChats({int limit = 50}) async {
    try {
      final result =
          await _method.invokeListMethod<Map<dynamic, dynamic>>('getMyChats', {
        'limit': limit,
      });
      return result?.map((e) => Map<String, dynamic>.from(e)).toList() ?? [];
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Get files from a specific chat (e.g. Saved Messages).
  static Future<List<Map<String, dynamic>>> getDriveFiles(
      {required int chatId, int limit = 2000}) async {
    try {
      final result = await _method
          .invokeListMethod<Map<dynamic, dynamic>>('getDriveFiles', {
        'chatId': chatId,
        'limit': limit,
      });
      return result?.map((e) => Map<String, dynamic>.from(e)).toList() ?? [];
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Start downloading a file from Telegram.
  static Future<Map<String, dynamic>> downloadFile(
      {required int fileId, int priority = 1, bool synchronous = false}) async {
    try {
      final result =
          await _method.invokeMapMethod<String, dynamic>('downloadFile', {
        'fileId': fileId,
        'priority': priority,
        'synchronous': synchronous,
      });
      return result ?? {};
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  static Future<bool> isOnWifi() async {
    try {
      return await _method.invokeMethod<bool>('isOnWifi') ?? false;
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// True when the device is currently on AC/USB power. Used by Auto Backup's
  /// "charging only" constraint.
  static Future<bool> isCharging() async {
    try {
      return await _method.invokeMethod<bool>('isCharging') ?? false;
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Approximate byte size of the TDLib/app cache, for Storage usage display.
  static Future<int> getCacheSizeBytes() async {
    try {
      final value = await _method.invokeMethod<num>('getCacheSizeBytes');
      return value?.toInt() ?? 0;
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Materialize an Android content URI so Dart can stream/split it.
  static Future<String> materializeFile(String uri) async {
    try {
      final value = await _method.invokeMethod<String>('materializeFile', {'uri': uri});
      if (value == null || value.isEmpty) {
        throw Exception('Unable to read the selected file.');
      }
      return value;
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Upload a file to a Telegram chat.
  static Future<Map<String, dynamic>> uploadFile({
    required int chatId,
    required String filePath,
    String? caption,
  }) async {
    try {
      final result =
          await _method.invokeMapMethod<String, dynamic>('uploadFile', {
        'chatId': chatId,
        'filePath': filePath,
        if (caption != null) 'caption': caption,
      });
      return result ?? {};
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Create a private channel (acts as a folder in Telegram Drive).
  static Future<Map<String, dynamic>> createFolder(
      {required String title}) async {
    try {
      final result =
          await _method.invokeMapMethod<String, dynamic>('createFolder', {
        'title': title,
      });
      return result ?? {};
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Copy a downloaded/reconstructed file into Android's public Downloads.
  static Future<String> saveToDownloads({
    required String sourcePath,
    required String fileName,
    String? mimeType,
  }) async {
    try {
      final value = await _method.invokeMethod<String>('saveToDownloads', {
        'sourcePath': sourcePath,
        'fileName': fileName,
        'mimeType': mimeType ?? 'application/octet-stream',
      });
      if (value == null || value.isEmpty) {
        throw Exception('Android did not return a download location.');
      }
      return value;
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Rename a Telegram channel used as a drive folder.
  static Future<void> renameFolder({
    required int chatId,
    required String title,
  }) async {
    try {
      await _method.invokeMethod('renameFolder', {
        'chatId': chatId,
        'title': title,
      });
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Leave/delete a Telegram channel used as a drive folder.
  static Future<void> deleteFolder({required int chatId}) async {
    try {
      await _method.invokeMethod('deleteFolder', {'chatId': chatId});
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Optimize (clear) the TDLib file cache.
  static Future<void> optimizeStorage() async {
    try {
      await _method.invokeMethod('optimizeStorage');
    } on PlatformException catch (e) {
      throw _mapError(e);
    }
  }

  /// Post an Android status notification (used for backup/transfer status).
  /// Safe to call when the POST_NOTIFICATIONS permission hasn't been granted —
  /// it silently no-ops on those devices.
  static Future<void> showNotification({
    required String title,
    required String body,
    int id = 1,
    String channelId = 'teledrive_transfers',
    String channelName = 'Transfers',
  }) async {
    try {
      await _method.invokeMethod('showNotification', {
        'title': title,
        'body': body,
        'id': id,
        'channelId': channelId,
        'channelName': channelName,
      });
    } on PlatformException catch (_) {
      // Posting can fail if the permission isn't granted — never fatal.
    }
  }

  /// Delete multiple messages from a chat.
  static Future<void> deleteMessages(
      {required int chatId,
      required List<int> messageIds,
      bool revoke = true}) async {
    try {
      await _method.invokeMethod('deleteMessages', {
        'chatId': chatId.toString(),
        'messageIds': messageIds.map((id) => id.toString()).toList(),
        'revoke': revoke,
      }).timeout(
        const Duration(seconds: 10),
        onTimeout: () => null, // silently succeed on timeout
      );
    } on PlatformException catch (e) {
      throw _mapError(e);
    } on TimeoutException {
      // Ignore timeout — TDLib may still process it in the background
    }
  }

  static Exception _mapError(PlatformException e) =>
      Exception(e.message ?? 'Unknown Telegram error');
}
