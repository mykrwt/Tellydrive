import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tellybase_mobile/core/config/app_config.dart';
import 'package:tellybase_mobile/core/di/providers.dart';
import 'package:tellybase_mobile/core/storage/preferences_storage.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_file.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/file_page.dart';
import 'package:tellybase_mobile/features/storage/domain/usecases/storage_usecases.dart';

class GalleryState {
  const GalleryState({
    this.files = const <CloudFile>[],
    this.total = 0,
    this.search = '',
    this.filter = MediaFilter.all,
    this.sort = FileSort.dateNewest,
    this.selected = const <String>{},
    this.usesGrid = true,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
  });

  final String? error;
  final MediaFilter filter;
  final List<CloudFile> files;
  final bool isLoading;
  final bool isLoadingMore;
  final String search;
  final Set<String> selected;
  final FileSort sort;
  final int total;
  final bool usesGrid;

  bool get hasMore => files.length < total;

  GalleryState copyWith({
    List<CloudFile>? files,
    int? total,
    String? search,
    MediaFilter? filter,
    FileSort? sort,
    Set<String>? selected,
    bool? usesGrid,
    bool? isLoading,
    bool? isLoadingMore,
    String? error,
    bool clearError = false,
  }) =>
      GalleryState(
        files: files ?? this.files,
        total: total ?? this.total,
        search: search ?? this.search,
        filter: filter ?? this.filter,
        sort: sort ?? this.sort,
        selected: selected ?? this.selected,
        usesGrid: usesGrid ?? this.usesGrid,
        isLoading: isLoading ?? this.isLoading,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
        error: clearError ? null : error ?? this.error,
      );
}

final galleryControllerProvider =
    StateNotifierProvider.autoDispose<GalleryController, GalleryState>((ref) {
  final controller = GalleryController(
    getMedia: ref.watch(getMediaPageProvider),
    commands: ref.watch(storageCommandsProvider),
    preferences: ref.watch(preferencesStorageProvider),
  );
  unawaited(controller.load());
  return controller;
});

class GalleryController extends StateNotifier<GalleryState> {
  GalleryController({
    required GetMediaPage getMedia,
    required StorageCommands commands,
    required PreferencesStorage preferences,
  })  : _getMedia = getMedia,
        _commands = commands,
        _preferences = preferences,
        super(GalleryState(usesGrid: preferences.galleryUsesGrid));

  final StorageCommands _commands;
  final GetMediaPage _getMedia;
  final PreferencesStorage _preferences;
  Timer? _searchTimer;

  @override
  void dispose() {
    _searchTimer?.cancel();
    super.dispose();
  }

  void clearSelection() => state = state.copyWith(selected: <String>{});

  Future<void> deleteSelected() async {
    final ids = state.selected.toList(growable: false);
    if (ids.isEmpty) return;
    try {
      for (final id in ids) {
        await _commands.repository.deleteFile(id);
      }
      state = state.copyWith(
        files: state.files.where((file) => !state.selected.contains(file.id)).toList(),
        total: state.total - ids.length,
        selected: <String>{},
        clearError: true,
      );
    } catch (error) {
      state = state.copyWith(error: error.toString());
      rethrow;
    }
  }

  Future<void> load({bool refresh = false}) async {
    if (state.isLoading && !refresh) return;
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final page = await _getMedia(
        offset: 0,
        limit: state.filter == MediaFilter.favorites ? 500 : AppConfig.pageSize,
        search: state.search,
        filter: state.filter,
        sort: state.sort,
      );
      if (!mounted) return;
      state = state.copyWith(
        files: page.files,
        total: page.total,
        isLoading: false,
        selected: <String>{},
        clearError: true,
      );
    } catch (error) {
      if (!mounted) return;
      state = state.copyWith(isLoading: false, error: error.toString());
    }
  }

  Future<void> loadMore() async {
    if (state.isLoading || state.isLoadingMore || !state.hasMore) return;
    state = state.copyWith(isLoadingMore: true, clearError: true);
    try {
      final page = await _getMedia(
        offset: state.files.length,
        limit: AppConfig.pageSize,
        search: state.search,
        filter: state.filter,
        sort: state.sort,
      );
      if (!mounted) return;
      final existing = state.files.map((file) => file.id).toSet();
      state = state.copyWith(
        files: [
          ...state.files,
          ...page.files.where((file) => !existing.contains(file.id)),
        ],
        total: page.total,
        isLoadingMore: false,
      );
    } catch (error) {
      if (mounted) {
        state = state.copyWith(isLoadingMore: false, error: error.toString());
      }
    }
  }

  Future<void> setFavorite(CloudFile file) async {
    final desired = !file.favorite;
    state = state.copyWith(
      files: state.files
          .map((item) => item.id == file.id ? item.copyWith(favorite: desired) : item)
          .toList(growable: false),
      clearError: true,
    );
    try {
      await _commands.repository.setFavorite(id: file.id, favorite: desired);
      if (state.filter == MediaFilter.favorites && !desired) {
        state = state.copyWith(
          files: state.files.where((item) => item.id != file.id).toList(),
          total: state.total - 1,
        );
      }
    } catch (error) {
      state = state.copyWith(
        files: state.files
            .map((item) => item.id == file.id ? item.copyWith(favorite: file.favorite) : item)
            .toList(growable: false),
        error: error.toString(),
      );
    }
  }

  void setFilter(MediaFilter value) {
    if (value == state.filter) return;
    state = state.copyWith(filter: value);
    unawaited(load());
  }

  void setSearch(String value) {
    state = state.copyWith(search: value);
    _searchTimer?.cancel();
    _searchTimer = Timer(const Duration(milliseconds: 350), load);
  }

  void setSort(FileSort value) {
    if (value == state.sort) return;
    state = state.copyWith(sort: value);
    unawaited(load());
  }

  void toggleSelection(String id) {
    final next = {...state.selected};
    next.contains(id) ? next.remove(id) : next.add(id);
    state = state.copyWith(selected: next);
  }

  Future<void> toggleView() async {
    final value = !state.usesGrid;
    state = state.copyWith(usesGrid: value);
    await _preferences.setGalleryUsesGrid(value: value);
  }
}
