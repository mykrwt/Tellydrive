import 'dart:async';
import 'dart:io';
import 'dart:math';

import '../../core/constants/app_constants.dart';
import '../../data/repositories/file_repository.dart';
import '../../domain/models/file_entry.dart';
import '../connectivity/connectivity_service.dart';
import 'backup_task.dart';

/// Coordinates every upload/download TellyBase performs: queuing,
/// concurrency limiting, pause/resume, automatic retry with exponential
/// backoff, and automatic resumption when connectivity returns — i.e. the
/// entire "Smart Backup" feature set, minus the OS-level scheduling glue
/// (see services/background/background_scheduler.dart for the
/// WorkManager-driven periodic trigger that keeps this running even when
/// the app is backgrounded).
class BackupEngine {
  BackupEngine({required FileRepository repository, required ConnectivityService connectivity})
      : _repository = repository,
        _connectivity = connectivity {
    _connSub = _connectivity.onlineChanges.listen((online) {
      if (online) _drainQueue();
    });
  }

  final FileRepository _repository;
  final ConnectivityService _connectivity;
  late final StreamSubscription<bool> _connSub;

  final Map<String, BackupTask> _tasks = {};
  final _taskController = StreamController<Map<String, BackupTask>>.broadcast();
  final Map<String, StreamSubscription> _activeStreams = {};
  final Map<String, Completer<void>> _pauseGates = {};

  int _activeCount = 0;

  Stream<Map<String, BackupTask>> get tasksStream => _taskController.stream;
  Map<String, BackupTask> get tasks => Map.unmodifiable(_tasks);

  void _emit() => _taskController.add(Map.unmodifiable(_tasks));

  /// Enqueues a manual or automatic backup of [file]. If the app already
  /// has this exact path queued/uploading, this is a no-op (idempotent),
  /// which matters for incremental background scans that may re-observe
  /// the same folder repeatedly.
  String enqueueUpload({
    required File file,
    required String folderPath,
    bool encryptContents = false,
  }) {
    final id = 'up:${file.path}';
    if (_tasks.containsKey(id) && !_tasks[id]!.isTerminal) return id;

    _tasks[id] = BackupTask(
      id: id,
      direction: BackupDirection.upload,
      sourceFile: file,
      folderPath: folderPath,
      encryptContents: encryptContents,
    );
    _emit();
    _drainQueue();
    return id;
  }

  String enqueueDownload({required FileEntry entry, required Directory destinationDir}) {
    final id = 'dl:${entry.id}';
    if (_tasks.containsKey(id) && !_tasks[id]!.isTerminal) return id;

    _tasks[id] = BackupTask(
      id: id,
      direction: BackupDirection.download,
      entry: entry,
      destinationDir: destinationDir,
    );
    _emit();
    _drainQueue();
    return id;
  }

  void pause(String taskId) {
    final task = _tasks[taskId];
    if (task == null || task.isTerminal) return;
    task.state = BackupTaskState.paused;
    _pauseGates[taskId] = Completer<void>();
    _emit();
  }

  void resume(String taskId) {
    final task = _tasks[taskId];
    if (task == null) return;
    task.state = BackupTaskState.queued;
    _pauseGates.remove(taskId)?.complete();
    _emit();
    _drainQueue();
  }

  void cancel(String taskId) {
    final task = _tasks[taskId];
    if (task == null) return;
    task.state = BackupTaskState.cancelled;
    _activeStreams.remove(taskId)?.cancel();
    _pauseGates.remove(taskId)?.complete();
    _emit();
  }

  void retry(String taskId) {
    final task = _tasks[taskId];
    if (task == null) return;
    task.state = BackupTaskState.queued;
    task.attempt = 0;
    task.lastError = null;
    _emit();
    _drainQueue();
  }

  Future<bool> _isCancelledOrPaused(String taskId) async {
    final task = _tasks[taskId];
    if (task == null) return true;
    if (task.state == BackupTaskState.cancelled) return true;
    final gate = _pauseGates[taskId];
    if (gate != null) {
      await gate.future; // blocks until resume() completes it
    }
    return _tasks[taskId]?.state == BackupTaskState.cancelled;
  }

  void _drainQueue() {
    if (!_connectivity.isOnline) return;
    while (_activeCount < AppConstants.maxConcurrentTransfers) {
      final next = _tasks.values.firstWhere(
        (t) => t.state == BackupTaskState.queued,
        orElse: () => BackupTask(id: '', direction: BackupDirection.upload),
      );
      if (next.id.isEmpty) return;
      _runTask(next);
    }
  }

  void _runTask(BackupTask task) {
    task.state = BackupTaskState.running;
    _activeCount++;
    _emit();

    final stream = task.direction == BackupDirection.upload
        ? _repository
            .backupFile(
              sourceFile: task.sourceFile!,
              folderPath: task.folderPath,
              encryptContents: task.encryptContents,
              isCancelled: () => _isCancelledOrPaused(task.id),
            )
            .map((p) => p.fraction)
        : _repository
            .downloadFile(
              entry: task.entry as FileEntry,
              destinationDir: task.destinationDir!,
              isCancelled: () => _isCancelledOrPaused(task.id),
            )
            .map((p) => p.fraction);

    _activeStreams[task.id] = stream.listen(
      (fraction) {
        task.progress = fraction;
        _emit();
      },
      onDone: () {
        _activeCount--;
        if (task.state != BackupTaskState.cancelled) {
          task.state = BackupTaskState.completed;
          task.progress = 1;
        }
        _activeStreams.remove(task.id);
        _emit();
        _drainQueue();
      },
      onError: (Object err) {
        _activeCount--;
        task.attempt++;
        task.lastError = err.toString();
        _activeStreams.remove(task.id);

        if (task.attempt >= AppConstants.maxUploadRetries) {
          task.state = BackupTaskState.failed;
          _emit();
        } else {
          task.state = BackupTaskState.queued;
          _emit();
          final backoff = AppConstants.retryBaseBackoff * pow(2, task.attempt).toInt();
          Timer(backoff, _drainQueue);
        }
      },
    );
  }

  void dispose() {
    _connSub.cancel();
    for (final s in _activeStreams.values) {
      s.cancel();
    }
    _taskController.close();
  }
}
