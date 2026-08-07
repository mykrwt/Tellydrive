import 'package:tellybase_mobile/features/storage/data/datasources/storage_remote_data_source.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_file.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_folder.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/file_page.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/upload_request.dart';
import 'package:tellybase_mobile/features/storage/domain/repositories/cloud_storage_repository.dart';

class CloudStorageRepositoryImpl implements CloudStorageRepository {
  const CloudStorageRepositoryImpl(this._remote);
  final StorageRemoteDataSource _remote;

  @override
  Future<CloudFolder> createFolder({required String name, String? parentId}) =>
      _remote.createFolder(name: name.trim(), parentId: parentId);

  @override
  Future<void> deleteFile(String id) => _remote.deleteFile(id);

  @override
  Future<void> deleteFolder(String id) => _remote.deleteFolder(id);

  @override
  Future<void> downloadFile({required String id, required String destinationPath}) =>
      _remote.downloadFile(id: id, destinationPath: destinationPath);

  @override
  Future<List<CloudFolder>> getAllFolders() => _remote.getAllFolders();

  @override
  Future<FolderContents> getFolderContents(String? folderId) =>
      _remote.getFolderContents(folderId);

  @override
  Future<FilePage> getMedia({
    required int offset,
    required int limit,
    required String search,
    required MediaFilter filter,
    required FileSort sort,
  }) =>
      _remote.getMedia(
        offset: offset,
        limit: limit,
        search: search,
        filter: filter,
        sort: sort,
      );

  @override
  Future<void> moveFile({required String id, String? folderId}) =>
      _remote.moveFile(id: id, folderId: folderId);

  @override
  Future<void> moveFolder({required String id, String? parentId}) =>
      _remote.moveFolder(id: id, parentId: parentId);

  @override
  Future<void> renameFile({required String id, required String name}) =>
      _remote.renameFile(id: id, name: name.trim());

  @override
  Future<void> renameFolder({required String id, required String name}) =>
      _remote.renameFolder(id: id, name: name.trim());

  @override
  Future<void> setFavorite({required String id, required bool favorite}) =>
      _remote.setFavorite(id: id, favorite: favorite);

  @override
  Future<String> upload(
    UploadRequest request, {
    UploadProgressCallback? onProgress,
  }) =>
      _remote.upload(request, onProgress: onProgress);
}
