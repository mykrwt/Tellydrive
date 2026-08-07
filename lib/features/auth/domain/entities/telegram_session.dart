import 'package:flutter/foundation.dart';

/// An authenticated Telegram session — everything needed to reconnect without
/// repeating the phone → OTP → 2FA dance.
@immutable
class TelegramSession {
  const TelegramSession({
    required this.authKey,
    required this.userId,
    this.firstName = '',
    this.username,
    this.phone,
    this.createdAt,
  });

  /// Serialized MTProto auth key / session string (opaque to the app layer).
  final String authKey;

  /// Numeric Telegram user id. Saved Messages peer = this id.
  final int userId;

  final String firstName;
  final String? username;
  final String? phone;
  final DateTime? createdAt;

  factory TelegramSession.fromJson(Map<String, dynamic> json) => TelegramSession(
        authKey: json['auth_key'] as String,
        userId: json['user_id'] as int,
        firstName: json['first_name'] as String? ?? '',
        username: json['username'] as String?,
        phone: json['phone'] as String?,
        createdAt: json['created_at'] != null
            ? DateTime.fromMillisecondsSinceEpoch(json['created_at'] as int)
            : null,
      );

  Map<String, dynamic> toJson() => {
        'auth_key': authKey,
        'user_id': userId,
        'first_name': firstName,
        'username': username,
        'phone': phone,
        'created_at': createdAt?.millisecondsSinceEpoch,
      };

  @override
  String toString() => 'TelegramSession(userId: $userId, user: $firstName)';
}
