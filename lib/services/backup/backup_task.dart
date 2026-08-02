import 'dart:io';

enum BackupTaskState { queued, running, paused, completed, failed, cancelled }
enum BackupDirection { upload, download }

/// One item in the backup/restore queue — a single file's transfer, which
/// under the hood may involve many chunk uploads/downloads (see
/// FileRepository), but is tracked here as one user-visible unit with one
/// progress bar, one pause/resume toggle, and one retry counter.
class BackupTask {
  BackupTask({
    required this.id,
    required this.direction,
    this.sourceFile,
    this.folderPath = '/',
    this.entry,
    this.destinationDir,
    this.encryptContents = false,
    this.state = BackupTaskState.queued,
    this.progress = 0,
    this.attempt = 0,
    this.lastError,
  });

  final String id;
  final BackupDirection direction;

  // Upload-only fields.
  final File? sourceFile;
  final String folderPath;
  final bool encryptContents;

  // Download-only fields.
  final dynamic entry; // FileEntry — kept dynamic here to avoid an import cycle in this file.
  final Directory? destinationDir;

  BackupTaskState state;
  double progress;
  int attempt;
  String? lastError;

  bool get isPaused => state == BackupTaskState.paused;
  bool get isTerminal =>
      state == BackupTaskState.completed || state == BackupTaskState.cancelled;
}
