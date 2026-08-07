import 'package:tellybase_mobile/features/storage/domain/entities/cloud_folder.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/file_page.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/upload_request.dart';
import 'package:tellybase_mobile/features/storage/domain/repositories/cloud_storage_repository.dart';

class GetMediaPage {
  const GetMediaPage(this._repository);
  final CloudStorageRepository _repository;

  Future<FilePage> call({
    required int offset,
    required int limit,
    required String search,
    required MediaFilter filter,
    required FileSort sort,
  }) =>
      _repository.getMedia(
        offset: offset,
        limit: limit,
        search: search,
        filter: filter,
        sort: sort,
      );
}

class GetFolderContents {
  const GetFolderContents(this._repository);
  final CloudStorageRepository _repository;
  Future<FolderContents> call(String? folderId) =>
      _repository.getFolderContents(folderId);
}

class StorageCommands {
  const StorageCommands(this.repository);
  final CloudStorageRepository repository;

  Future<String> upload(
    UploadRequest request, {
    UploadProgressCallback? onProgress,
  }) =>
      repository.upload(request, onProgress: onProgress);
}
