import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mime/mime.dart';
import 'package:tellybase_mobile/core/di/providers.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/upload_request.dart';
import 'package:tellybase_mobile/features/storage/domain/usecases/storage_usecases.dart';

enum UploadStatus { queued, uploading, complete, failed }

class UploadItem {
  const UploadItem({
    required this.id,
    required this.name,
    required this.status,
    this.progress = 0,
    this.error,
  });

  final String? error;
  final String id;
  final String name;
  final double progress;
  final UploadStatus status;

  UploadItem copyWith({
    UploadStatus? status,
    double? progress,
    String? error,
  }) =>
      UploadItem(
        id: id,
        name: name,
        status: status ?? this.status,
        progress: progress ?? this.progress,
        error: error,
      );
}

final uploadControllerProvider =
    StateNotifierProvider<UploadController, List<UploadItem>>((ref) {
  return UploadController(ref.watch(storageCommandsProvider));
});

class UploadController extends StateNotifier<List<UploadItem>> {
  UploadController(this._commands) : super(const <UploadItem>[]);
  final StorageCommands _commands;

  void dismissFinished() {
    state = state
        .where((item) => item.status == UploadStatus.uploading || item.status == UploadStatus.queued)
        .toList(growable: false);
  }

  Future<int> uploadFiles(
    List<PlatformFile> files, {
    required String source,
    required bool allowAny,
    String? folderId,
  }) async {
    final entries = files
        .map(
          (file) => UploadItem(
            id: '${DateTime.now().microsecondsSinceEpoch}_${file.name}_${file.size}',
            name: file.name,
            status: UploadStatus.queued,
          ),
        )
        .toList(growable: false);
    state = [...state, ...entries];
    var completed = 0;

    for (var index = 0; index < files.length; index += 1) {
      final file = files[index];
      final item = entries[index];
      if (file.path == null) {
        _update(
          item.id,
          (value) => value.copyWith(
            status: UploadStatus.failed,
            error: 'The selected file is not accessible.',
          ),
        );
        continue;
      }
      _update(item.id, (value) => value.copyWith(status: UploadStatus.uploading));
      try {
        await _commands.upload(
          UploadRequest(
            path: file.path!,
            name: file.name,
            size: file.size,
            mimeType: lookupMimeType(file.name) ?? 'application/octet-stream',
            source: source,
            folderId: folderId,
            allowAny: allowAny,
          ),
          onProgress: (progress) => _update(
            item.id,
            (value) => value.copyWith(
              progress: progress.fraction.clamp(0, 1).toDouble(),
            ),
          ),
        );
        completed += 1;
        _update(
          item.id,
          (value) => value.copyWith(
            status: UploadStatus.complete,
            progress: 1,
          ),
        );
      } catch (error) {
        _update(
          item.id,
          (value) => value.copyWith(
            status: UploadStatus.failed,
            error: error.toString(),
          ),
        );
      }
    }
    return completed;
  }

  void _update(String id, UploadItem Function(UploadItem item) transform) {
    if (!mounted) return;
    state = state
        .map((item) => item.id == id ? transform(item) : item)
        .toList(growable: false);
  }
}
