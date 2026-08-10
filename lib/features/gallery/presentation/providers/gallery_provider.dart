import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../drive/domain/entities/drive_file.dart';
import '../../../drive/presentation/providers/drive_provider.dart';

class GalleryState {
  final List<DriveFile> media;
  final bool isLoading;
  final String? error;

  const GalleryState({
    this.media = const [],
    this.isLoading = false,
    this.error,
  });

  GalleryState copyWith({
    List<DriveFile>? media,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) =>
      GalleryState(
        media: media ?? this.media,
        isLoading: isLoading ?? this.isLoading,
        error: clearError ? null : error ?? this.error,
      );
}

class GalleryNotifier extends StateNotifier<GalleryState> {
  GalleryNotifier(this._ref) : super(const GalleryState()) {
    refresh();
  }

  final Ref _ref;

  // Refresh scans every folder's Telegram history, so it's the most expensive
  // operation in the app. The Files screen listens to upload completions and
  // calls refresh() once per finished task — batch-uploading 10 photos would
  // otherwise trigger 10 overlapping full scans. Collapse concurrent calls.
  bool _refreshing = false;

  Future<void> refresh() async {
    if (_refreshing) return;
    _refreshing = true;
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final repository = _ref.read(driveRepositoryProvider);
      final folders = await repository.getFolders();
      final filesByFolder = await Future.wait(
        folders.map((folder) => repository.getFiles(folderId: folder.id)),
      );
      final media = filesByFolder
          .expand((files) => files)
          .where((file) =>
              file.type == DriveFileType.image ||
              file.type == DriveFileType.video)
          .toList()
        ..sort((a, b) => b.uploadedAt.compareTo(a.uploadedAt));
      if (!mounted) return;
      state = GalleryState(media: media);
    } catch (error) {
      if (!mounted) return;
      state = state.copyWith(isLoading: false, error: error.toString());
    } finally {
      _refreshing = false;
    }
  }

  Future<void> delete(List<DriveFile> files) async {
    if (files.isEmpty) return;
    await _ref.read(driveRepositoryProvider).deleteFiles(files);
    if (!mounted) return;
    final removed = files.map((file) => '${file.folderId}:${file.id}').toSet();
    state = state.copyWith(
      media: state.media
          .where((file) => !removed.contains('${file.folderId}:${file.id}'))
          .toList(),
    );
    _ref.read(driveProvider.notifier).loadFiles();
  }
}

final galleryProvider = StateNotifierProvider<GalleryNotifier, GalleryState>((ref) {
  return GalleryNotifier(ref);
});
