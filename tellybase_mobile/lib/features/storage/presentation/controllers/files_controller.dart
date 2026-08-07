import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tellybase_mobile/core/di/providers.dart';
import 'package:tellybase_mobile/core/storage/preferences_storage.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_file.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_folder.dart';
import 'package:tellybase_mobile/features/storage/domain/usecases/storage_usecases.dart';

enum FileCategory { all, documents, media, audio, archives }

class FilesState {
  const FilesState({
    this.contents,
    this.search = '',
    this.category = FileCategory.all,
    this.usesGrid = false,
    this.isLoading = false,
    this.error,
  });

  final FileCategory category;
  final FolderContents? contents;
  final String? error;
  final bool isLoading;
  final String search;
  final bool usesGrid;

  List<CloudFile> get visibleFiles {
    final query = search.trim().toLowerCase();
    final files = contents?.files ?? const <CloudFile>[];
    return files.where((file) {
      if (query.isNotEmpty && !file.name.toLowerCase().contains(query)) return false;
      return switch (category) {
        FileCategory.all => true,
        FileCategory.documents => file.kind == CloudFileKind.document || file.kind == CloudFileKind.code,
        FileCategory.media => file.kind == CloudFileKind.image || file.kind == CloudFileKind.video,
        FileCategory.audio => file.kind == CloudFileKind.audio,
        FileCategory.archives => file.kind == CloudFileKind.archive,
      };
    }).toList(growable: false);
  }

  List<CloudFolder> get visibleFolders {
    final query = search.trim().toLowerCase();
    if (category != FileCategory.all) return const <CloudFolder>[];
    final folders = contents?.folders ?? const <CloudFolder>[];
    return query.isEmpty
        ? folders
        : folders
            .where((folder) => folder.name.toLowerCase().contains(query))
            .toList(growable: false);
  }

  FilesState copyWith({
    FolderContents? contents,
    String? search,
    FileCategory? category,
    bool? usesGrid,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) =>
      FilesState(
        contents: contents ?? this.contents,
        search: search ?? this.search,
        category: category ?? this.category,
        usesGrid: usesGrid ?? this.usesGrid,
        isLoading: isLoading ?? this.isLoading,
        error: clearError ? null : error ?? this.error,
      );
}

final filesControllerProvider =
    StateNotifierProvider.autoDispose<FilesController, FilesState>((ref) {
  final controller = FilesController(
    getContents: ref.watch(getFolderContentsProvider),
    commands: ref.watch(storageCommandsProvider),
    preferences: ref.watch(preferencesStorageProvider),
  );
  unawaited(controller.openFolder(null));
  return controller;
});

class FilesController extends StateNotifier<FilesState> {
  FilesController({
    required GetFolderContents getContents,
    required StorageCommands commands,
    required PreferencesStorage preferences,
  })  : _getContents = getContents,
        _commands = commands,
        _preferences = preferences,
        super(FilesState(usesGrid: preferences.filesUseGrid));

  final StorageCommands _commands;
  final GetFolderContents _getContents;
  final PreferencesStorage _preferences;

  Future<void> createFolder(String name) async {
    await _runCommand(
      () => _commands.repository.createFolder(
        name: name,
        parentId: state.contents?.folderId,
      ),
    );
  }

  Future<void> deleteFile(String id) async {
    await _runCommand(() => _commands.repository.deleteFile(id));
  }

  Future<void> deleteFolder(String id) async {
    await _runCommand(() => _commands.repository.deleteFolder(id));
  }

  Future<void> goUp() async {
    final path = state.contents?.path ?? const <CloudFolder>[];
    if (path.isEmpty) return;
    final parentId = path.length <= 1 ? null : path[path.length - 2].id;
    await openFolder(parentId);
  }

  Future<List<CloudFolder>> getAllFolders() =>
      _commands.repository.getAllFolders();

  Future<void> moveFile(String id, String? folderId) async {
    await _runCommand(
      () => _commands.repository.moveFile(id: id, folderId: folderId),
    );
  }

  Future<void> moveFolder(String id, String? parentId) async {
    await _runCommand(
      () => _commands.repository.moveFolder(id: id, parentId: parentId),
    );
  }

  Future<void> openFolder(String? folderId) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final contents = await _getContents(folderId);
      if (!mounted) return;
      state = state.copyWith(contents: contents, isLoading: false, clearError: true);
    } catch (error) {
      if (mounted) state = state.copyWith(isLoading: false, error: error.toString());
    }
  }

  Future<void> refresh() => openFolder(state.contents?.folderId);

  Future<void> renameFile(String id, String name) async {
    await _runCommand(() => _commands.repository.renameFile(id: id, name: name));
  }

  Future<void> renameFolder(String id, String name) async {
    await _runCommand(() => _commands.repository.renameFolder(id: id, name: name));
  }

  void setCategory(FileCategory value) => state = state.copyWith(category: value);
  void setSearch(String value) => state = state.copyWith(search: value);

  Future<void> toggleView() async {
    final value = !state.usesGrid;
    state = state.copyWith(usesGrid: value);
    await _preferences.setFilesUseGrid(value: value);
  }

  Future<void> _runCommand<T>(Future<T> Function() command) async {
    state = state.copyWith(clearError: true);
    try {
      await command();
      await refresh();
    } catch (error) {
      state = state.copyWith(error: error.toString());
      rethrow;
    }
  }
}
