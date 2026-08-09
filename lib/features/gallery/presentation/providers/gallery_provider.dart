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

  Future<void> refresh() async {
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
      state = GalleryState(media: media);
    } catch (error) {
      state = state.copyWith(isLoading: false, error: error.toString());
    }
  }

  Future<void> delete(List<DriveFile> files) async {
    if (files.isEmpty) return;
    await _ref.read(driveRepositoryProvider).deleteFiles(files);
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
