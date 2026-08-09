import 'dart:convert' as dart_convert;
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../domain/entities/drive_file.dart';
import '../../domain/entities/drive_folder.dart';
import '../../domain/repositories/drive_repository.dart';
import '../../data/repositories/drive_repository_impl.dart';
import '../../../../services/platform/native_telegram_channel.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final driveRepositoryProvider = Provider<DriveRepository>((ref) {
  return DriveRepositoryImpl();
});

final driveProvider = StateNotifierProvider<DriveNotifier, DriveState>((ref) {
  return DriveNotifier(ref.read(driveRepositoryProvider));
});

final uploadProvider =
    StateNotifierProvider<UploadNotifier, UploadState>((ref) {
  return UploadNotifier(ref.read(driveRepositoryProvider), ref);
});

// ─── Drive State ──────────────────────────────────────────────────────────────

enum SortOption { newest, oldest, nameAZ, nameZA, sizeAsc, sizeDesc }

enum ViewMode { grid, list }

class DriveState {
  final List<DriveFile> files;
  final List<DriveFolder> folders;
  final String currentFolderId;
  final bool isLoadingFiles;
  final bool isLoadingFolders;
  final String? error;
  final String searchQuery;
  final DriveFileType? filterType;
  final SortOption sortOption;
  final ViewMode viewMode;
  final Set<String> selectedFileIds;
  final bool isSelectionMode;
  final Set<String> pendingDeleteFileIds;

  const DriveState({
    this.files = const [],
    this.folders = const [],
    this.currentFolderId = DriveRepositoryImpl.savedMessagesId,
    this.isLoadingFiles = false,
    this.isLoadingFolders = false,
    this.error,
    this.searchQuery = '',
    this.filterType,
    this.sortOption = SortOption.newest,
    this.viewMode = ViewMode.grid,
    this.selectedFileIds = const {},
    this.isSelectionMode = false,
    this.pendingDeleteFileIds = const {},
  });

  List<DriveFile> get filteredFiles {
    var result =
        files.where((f) => !pendingDeleteFileIds.contains(f.id)).toList();
    if (searchQuery.isNotEmpty) {
      result = result
          .where(
              (f) => f.name.toLowerCase().contains(searchQuery.toLowerCase()))
          .toList();
    }
    if (filterType != null) {
      result = result.where((f) => f.type == filterType).toList();
    }
    switch (sortOption) {
      case SortOption.newest:
        result.sort((a, b) => b.uploadedAt.compareTo(a.uploadedAt));
      case SortOption.oldest:
        result.sort((a, b) => a.uploadedAt.compareTo(b.uploadedAt));
      case SortOption.nameAZ:
        result.sort((a, b) => a.name.compareTo(b.name));
      case SortOption.nameZA:
        result.sort((a, b) => b.name.compareTo(a.name));
      case SortOption.sizeAsc:
        result.sort((a, b) => a.size.compareTo(b.size));
      case SortOption.sizeDesc:
        result.sort((a, b) => b.size.compareTo(a.size));
    }
    return result;
  }

  DriveState copyWith({
    List<DriveFile>? files,
    List<DriveFolder>? folders,
    String? currentFolderId,
    bool? isLoadingFiles,
    bool? isLoadingFolders,
    String? error,
    String? searchQuery,
    DriveFileType? filterType,
    SortOption? sortOption,
    ViewMode? viewMode,
    Set<String>? selectedFileIds,
    bool? isSelectionMode,
    Set<String>? pendingDeleteFileIds,
    bool clearFilter = false,
    bool clearError = false,
  }) {
    return DriveState(
      files: files ?? this.files,
      folders: folders ?? this.folders,
      currentFolderId: currentFolderId ?? this.currentFolderId,
      isLoadingFiles: isLoadingFiles ?? this.isLoadingFiles,
      isLoadingFolders: isLoadingFolders ?? this.isLoadingFolders,
      error: clearError ? null : (error ?? this.error),
      searchQuery: searchQuery ?? this.searchQuery,
      filterType: clearFilter ? null : (filterType ?? this.filterType),
      sortOption: sortOption ?? this.sortOption,
      viewMode: viewMode ?? this.viewMode,
      selectedFileIds: selectedFileIds ?? this.selectedFileIds,
      isSelectionMode: isSelectionMode ?? this.isSelectionMode,
      pendingDeleteFileIds: pendingDeleteFileIds ?? this.pendingDeleteFileIds,
    );
  }
}

// ─── Drive Notifier ───────────────────────────────────────────────────────────

class DriveNotifier extends StateNotifier<DriveState> {
  final DriveRepository _repository;

  DriveNotifier(this._repository) : super(const DriveState()) {
    _loadViewPreference();
    loadAll();
  }

  Future<void> _loadViewPreference() async {
    final prefs = await SharedPreferences.getInstance();
    final mode = prefs.getString('app_view_mode') ?? 'grid';
    final preferred = mode == 'list' ? ViewMode.list : ViewMode.grid;
    if (state.viewMode != preferred) state = state.copyWith(viewMode: preferred);
  }

  Future<void> loadAll() async {
    await Future.wait([loadFolders(), loadFiles()]);
  }

  Future<void> loadFiles({String? folderId}) async {
    state = state.copyWith(isLoadingFiles: true, clearError: true);
    try {
      final id = folderId ?? state.currentFolderId;
      var files = await _repository.getFiles(folderId: id);

      // Always retry once if TDLib returned an empty list
      // (happens on first launch and after folder switches while TDLib syncs)
      if (files.isEmpty) {
        await Future<void>.delayed(const Duration(milliseconds: 500));
        files = await _repository.getFiles(folderId: id);
      }

      state = state.copyWith(
          files: files, isLoadingFiles: false, currentFolderId: id);
    } catch (e) {
      state = state.copyWith(isLoadingFiles: false, error: e.toString());
    }
  }

  Future<void> loadFolders() async {
    state = state.copyWith(isLoadingFolders: true);
    try {
      final folders = await _repository.getFolders();
      state = state.copyWith(folders: folders, isLoadingFolders: false);
    } catch (e) {
      state = state.copyWith(isLoadingFolders: false, error: e.toString());
    }
  }

  void switchFolder(String folderId) {
    if (folderId == state.currentFolderId) return;
    // Clear current files immediately so the loading spinner shows
    state = state
        .copyWith(files: [], isLoadingFiles: true, currentFolderId: folderId);
    loadFiles(folderId: folderId);
  }

  void toggleViewMode() {
    final next =
        state.viewMode == ViewMode.grid ? ViewMode.list : ViewMode.grid;
    state = state.copyWith(viewMode: next);
  }

  void setSearchQuery(String query) {
    state = state.copyWith(searchQuery: query);
  }

  void setFilter(DriveFileType? type) {
    state = state.copyWith(filterType: type, clearFilter: type == null);
  }

  void setSort(SortOption option) {
    state = state.copyWith(sortOption: option);
  }

  // --- Selection Mode ---
  void toggleSelectionMode() {
    state = state
        .copyWith(isSelectionMode: !state.isSelectionMode, selectedFileIds: {});
  }

  void toggleFileSelection(String fileId) {
    final selected = Set<String>.from(state.selectedFileIds);
    if (selected.contains(fileId)) {
      selected.remove(fileId);
    } else {
      selected.add(fileId);
    }
    state = state.copyWith(
        selectedFileIds: selected, isSelectionMode: selected.isNotEmpty);
  }

  void clearSelection() {
    state = state.copyWith(isSelectionMode: false, selectedFileIds: {});
  }

  // --- Deletion & Undo ---
  void hideFilesPendingDeletion(List<DriveFile> files) {
    final pending = Set<String>.from(state.pendingDeleteFileIds);
    pending.addAll(files.map((e) => e.id));
    state = state.copyWith(
        pendingDeleteFileIds: pending,
        isSelectionMode: false,
        selectedFileIds: {});
  }

  void undoDeletion(List<DriveFile> files) {
    final pending = Set<String>.from(state.pendingDeleteFileIds);
    pending.removeAll(files.map((e) => e.id));
    state = state.copyWith(pendingDeleteFileIds: pending);
  }

  Future<void> confirmDeletion(List<DriveFile> files) async {
    try {
      await _repository.deleteFiles(files);

      final idsToRemove = files.map((e) => e.id).toSet();
      final updatedFiles =
          state.files.where((f) => !idsToRemove.contains(f.id)).toList();

      final pending = Set<String>.from(state.pendingDeleteFileIds);
      pending.removeAll(idsToRemove);

      state =
          state.copyWith(files: updatedFiles, pendingDeleteFileIds: pending);
    } catch (e) {
      // Revert the hide since delete failed
      undoDeletion(files);
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> deleteFile(DriveFile file) async {
    // Kept for backward compatibility or direct deletes
    await confirmDeletion([file]);
  }

  /// Called after a file is downloaded to update its localPath in state.
  void updateFileLocalPath(String fileId, String localPath) {
    final updatedFiles = state.files.map((f) {
      if (f.id == fileId) {
        return f.copyWith(localPath: localPath, isDownloaded: true);
      }
      return f;
    }).toList();
    state = state.copyWith(files: updatedFiles);
  }

  Future<DriveFolder> createFolder(String name) async {
    final folder = await _repository.createFolder(name);
    state = state.copyWith(folders: [...state.folders, folder]);
    return folder;
  }

  Future<DriveFolder> renameFolder(DriveFolder folder, String newName) async {
    final updated = await _repository.renameFolder(folder, newName);
    state = state.copyWith(
      folders: state.folders.map((f) => f.id == folder.id ? updated : f).toList(),
    );
    return updated;
  }

  Future<void> importTelegramChannel(String chatId, String title) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final imported = prefs.getStringList('imported_folders') ?? [];
      final entry = '$chatId:$title';
      if (!imported.any((e) => e.startsWith('$chatId:'))) {
        imported.add(entry);
        await prefs.setStringList('imported_folders', imported);
      }

      // Check if already exists in state to avoid duplicate UI entries
      final exists = state.folders.any((f) => f.id == chatId);
      if (!exists) {
        final newFolder = DriveFolder(
          id: chatId,
          title: title,
          telegramChannelId: chatId,
          createdAt: DateTime.now(),
          fileCount: 0,
        );
        state = state.copyWith(folders: [...state.folders, newFolder]);
      }
    } catch (e) {
      state = state.copyWith(error: 'Failed to link channel: ${e.toString()}');
    }
  }

  Future<void> deleteFolder(DriveFolder folder) async {
    try {
      // If it's a custom/imported folder, also remove from imported list in SharedPreferences
      final prefs = await SharedPreferences.getInstance();
      final imported = prefs.getStringList('imported_folders') ?? [];
      final updatedImported = imported.where((e) => !e.startsWith('${folder.id}:')).toList();
      if (imported.length != updatedImported.length) {
        await prefs.setStringList('imported_folders', updatedImported);
      }

      await _repository.deleteFolder(folder);
      final updated = state.folders.where((f) => f.id != folder.id).toList();
      state = state.copyWith(folders: updated);
    } catch (e) {
      // If native deletion fails but it was an imported folder, we still want to remove it locally from state and preferences!
      final prefs = await SharedPreferences.getInstance();
      final imported = prefs.getStringList('imported_folders') ?? [];
      final updatedImported = imported.where((e) => !e.startsWith('${folder.id}:')).toList();
      if (imported.length != updatedImported.length) {
        await prefs.setStringList('imported_folders', updatedImported);
        final updatedState = state.folders.where((f) => f.id != folder.id).toList();
        state = state.copyWith(folders: updatedState);
      } else {
        state = state.copyWith(error: e.toString());
      }
    }
  }
}

// ─── Upload State ─────────────────────────────────────────────────────────────

enum UploadStatus { pending, uploading, completed, failed }

class UploadTask {
  final String id;
  final String localPath;
  final String fileName;
  final String folderId;
  final double progress;
  final bool isComplete;
  final bool hasError;
  final String? error;
  final UploadStatus status;

  const UploadTask({
    required this.id,
    required this.localPath,
    required this.fileName,
    required this.folderId,
    this.progress = 0,
    this.isComplete = false,
    this.hasError = false,
    this.error,
    this.status = UploadStatus.pending,
  });

  UploadTask copyWith({
    double? progress,
    bool? isComplete,
    bool? hasError,
    String? error,
    UploadStatus? status,
  }) {
    final nextComplete = isComplete ?? this.isComplete;
    final nextError = hasError ?? this.hasError;
    UploadStatus nextStatus = status ?? this.status;
    // Derive status from flags if not explicitly provided
    if (status == null) {
      if (nextComplete) {
        nextStatus = UploadStatus.completed;
      } else if (nextError) {
        nextStatus = UploadStatus.failed;
      } else if ((progress ?? this.progress) > 0) {
        nextStatus = UploadStatus.uploading;
      } else {
        nextStatus = UploadStatus.pending;
      }
    }
    return UploadTask(
      id: id,
      localPath: localPath,
      fileName: fileName,
      folderId: folderId,
      progress: progress ?? this.progress,
      isComplete: nextComplete,
      hasError: nextError,
      error: error ?? this.error,
      status: nextStatus,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'localPath': localPath,
        'fileName': fileName,
        'folderId': folderId,
        'progress': progress,
        'isComplete': isComplete,
        'hasError': hasError,
        'error': error,
        'status': status.name,
      };

  factory UploadTask.fromJson(Map<String, dynamic> json) => UploadTask(
        id: json['id'] as String,
        localPath: json['localPath'] as String,
        fileName: json['fileName'] as String,
        folderId: json['folderId'] as String,
        progress: (json['progress'] as num?)?.toDouble() ?? 0,
        isComplete: json['isComplete'] as bool? ?? false,
        hasError: json['hasError'] as bool? ?? false,
        error: json['error'] as String?,
        status: UploadStatus.values.firstWhere(
          (e) => e.name == (json['status'] as String? ?? 'pending'),
          orElse: () => UploadStatus.pending,
        ),
      );
}

class UploadState {
  final List<UploadTask> tasks;
  const UploadState({this.tasks = const []});

  bool get hasActiveTasks => tasks.any((t) => t.status == UploadStatus.uploading || t.status == UploadStatus.pending);
}

class UploadNotifier extends StateNotifier<UploadState> {
  final DriveRepository _repository;
  final Ref _ref;
  static const _persistKey = 'pending_upload_tasks_v2';

  UploadNotifier(this._repository, this._ref) : super(const UploadState()) {
    _restorePersisted();
  }

  Future<void> _persist() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final pending = state.tasks.where((t) => !t.isComplete).toList();
      final json = pending.map((t) => t.toJson()).toList();
      await prefs.setString(_persistKey, dart_convert.jsonEncode(json));
    } catch (_) {}
  }

  Future<void> _restorePersisted() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_persistKey);
      if (raw == null || raw.isEmpty) return;
      final list = dart_convert.jsonDecode(raw) as List;
      final tasks = list.map((e) => UploadTask.fromJson(Map<String, dynamic>.from(e as Map))).toList();
      // Any uploading task from previous session is now considered failed/interrupted
      // and can be retried (chunked uploads will resume via chunk resume keys).
      final restored = tasks.map((t) {
        if (t.status == UploadStatus.uploading || t.status == UploadStatus.pending) {
          return t.copyWith(hasError: true, error: 'Interrupted — tap retry to resume', status: UploadStatus.failed);
        }
        return t;
      }).toList();
      if (restored.isNotEmpty) state = UploadState(tasks: restored);
    } catch (_) {}
  }

  Future<void> _uploadFileInternal(String taskId, String localPath, String fileName, String folderId) async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool('uploads_wifi_only') == true && !await NativeTelegramChannel.isOnWifi()) {
      throw StateError('Wi-Fi-only uploads are enabled. Connect to Wi-Fi and retry.');
    }
    _updateTask(taskId, progress: 0.01, status: UploadStatus.uploading);
    await _repository.uploadFile(
      localPath: localPath,
      fileName: fileName,
      folderId: folderId,
      onProgress: (progress) {
        _updateTask(taskId, progress: progress, status: progress >= 1 ? UploadStatus.completed : UploadStatus.uploading);
      },
    );
  }

  Future<void> uploadFile({
    required String localPath,
    required String fileName,
    required String folderId,
  }) async {
    final taskId = 'task_${DateTime.now().millisecondsSinceEpoch}_${fileName.hashCode}';
    final task = UploadTask(
      id: taskId,
      localPath: localPath,
      fileName: fileName,
      folderId: folderId,
      status: UploadStatus.pending,
    );
    state = UploadState(tasks: [...state.tasks, task]);
    await _persist();

    try {
      await _uploadFileInternal(taskId, localPath, fileName, folderId);
      _updateTask(taskId, progress: 1.0, isComplete: true, hasError: false, status: UploadStatus.completed);
      await _persist();
      await Future<void>.delayed(const Duration(milliseconds: 600));
      await _ref.read(driveProvider.notifier).loadFiles(folderId: folderId);
    } catch (e) {
      _updateTask(taskId, hasError: true, error: e.toString(), status: UploadStatus.failed);
      await _persist();
    }
  }

  Future<void> retryUpload(String taskId) async {
    UploadTask? task;
    for (final candidate in state.tasks) {
      if (candidate.id == taskId) task = candidate;
    }
    final retryTask = task;
    if (retryTask == null || retryTask.status != UploadStatus.failed) return;
    // Validate source still exists before retrying — otherwise fail gracefully
    try {
      final file = File(retryTask.localPath);
      // content:// URIs are already materialized to a cache path at upload time
      if (!retryTask.localPath.startsWith('content://') && !await file.exists()) {
        _updateTask(taskId, hasError: true, error: 'Original file no longer exists', status: UploadStatus.failed);
        await _persist();
        return;
      }
    } catch (_) {}
    _updateTask(taskId, progress: retryTask.progress, hasError: false, error: '', status: UploadStatus.pending);
    await _persist();
    try {
      await _uploadFileInternal(taskId, retryTask.localPath, retryTask.fileName, retryTask.folderId);
      _updateTask(taskId, progress: 1, isComplete: true, hasError: false, status: UploadStatus.completed);
      await _persist();
      await Future<void>.delayed(const Duration(milliseconds: 600));
      await _ref.read(driveProvider.notifier).loadFiles(folderId: retryTask.folderId);
    } catch (error) {
      _updateTask(taskId, hasError: true, error: error.toString(), status: UploadStatus.failed);
      await _persist();
    }
  }

  void _updateTask(String taskId, {double? progress, bool? isComplete, bool? hasError, String? error, UploadStatus? status}) {
    final updated = state.tasks.map((t) {
      if (t.id == taskId) {
        return t.copyWith(progress: progress, isComplete: isComplete, hasError: hasError, error: error, status: status);
      }
      return t;
    }).toList();
    state = UploadState(tasks: updated);
    // Persist asynchronously without blocking UI
    _persist();
  }

  void clearCompleted() {
    final active = state.tasks.where((t) => !t.isComplete).toList();
    state = UploadState(tasks: active);
    _persist();
  }
}
