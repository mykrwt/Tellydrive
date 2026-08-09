import 'dart:convert';

/// A single Auto Backup rule that maps a local phone folder to a Telegram
/// destination (a drive folder / Telegram channel / Saved Messages).
///
/// When Auto Backup is enabled globally and this rule is enabled, the
/// [BackupMonitorService] scans [folderPath] for files whose fingerprint
/// (path|size|modifiedMs) has not been seen before and uploads them to
/// [telegramFolderId], preserving the original filename.
class BackupRule {
  BackupRule({
    required this.id,
    required this.folderPath,
    required this.folderName,
    required this.telegramFolderId,
    required this.telegramFolderTitle,
    required this.createdAt,
    this.enabled = true,
    this.includeSubfolders = false,
  });

  /// Stable unique id (uuid).
  final String id;

  /// Absolute path of the local phone folder to back up (e.g. the path
  /// returned by the directory picker).
  final String folderPath;

  /// Human readable name (last path segment) shown in the UI.
  final String folderName;

  /// Destination drive folder id (matches [DriveFolder.id]). Files are
  /// uploaded to this Telegram chat. This is what actually controls where
  /// each file goes — not just a UI label.
  final String telegramFolderId;

  /// Display name of the destination, cached for offline rendering.
  final String telegramFolderTitle;

  final DateTime createdAt;
  final bool enabled;

  /// When true the monitor descends into subfolders of [folderPath].
  final bool includeSubfolders;

  BackupRule copyWith({
    String? folderPath,
    String? folderName,
    String? telegramFolderId,
    String? telegramFolderTitle,
    bool? enabled,
    bool? includeSubfolders,
  }) {
    return BackupRule(
      id: id,
      folderPath: folderPath ?? this.folderPath,
      folderName: folderName ?? this.folderName,
      telegramFolderId: telegramFolderId ?? this.telegramFolderId,
      telegramFolderTitle: telegramFolderTitle ?? this.telegramFolderTitle,
      createdAt: createdAt,
      enabled: enabled ?? this.enabled,
      includeSubfolders: includeSubfolders ?? this.includeSubfolders,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'folderPath': folderPath,
        'folderName': folderName,
        'telegramFolderId': telegramFolderId,
        'telegramFolderTitle': telegramFolderTitle,
        'createdAt': createdAt.toIso8601String(),
        'enabled': enabled,
        'includeSubfolders': includeSubfolders,
      };

  factory BackupRule.fromJson(Map<String, dynamic> json) {
    return BackupRule(
      id: json['id'] as String,
      folderPath: json['folderPath'] as String,
      folderName: json['folderName'] as String? ?? '',
      telegramFolderId: json['telegramFolderId'] as String,
      telegramFolderTitle: json['telegramFolderTitle'] as String? ?? '',
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
      enabled: json['enabled'] as bool? ?? true,
      includeSubfolders: json['includeSubfolders'] as bool? ?? false,
    );
  }

  String encode() => jsonEncode(toJson());

  static BackupRule decode(String raw) =>
      BackupRule.fromJson(Map<String, dynamic>.from(jsonDecode(raw) as Map));
}
