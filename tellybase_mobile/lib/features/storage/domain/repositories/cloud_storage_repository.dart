import 'package:tellybase_mobile/features/storage/domain/entities/cloud_file.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_folder.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/file_page.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/upload_request.dart';

abstract interface class CloudStorageRepository {
  Future<CloudFolder> createFolder({required String name, String? parentId});
  Future<void> deleteFile(String id);
  Future<void> deleteFolder(String id);
  Future<void> downloadFile({required String id, required String destinationPath});
  Future<List<CloudFolder>> getAllFolders();
  Future<FolderContents> getFolderContents(String? folderId);
  Future<FilePage> getMedia({
    required int offset,
    required int limit,
    required String search,
    required MediaFilter filter,
    required FileSort sort,
  });
  Future<void> moveFile({required String id, String? folderId});
  Future<void> moveFolder({required String id, String? parentId});
  Future<void> renameFile({required String id, required String name});
  Future<void> renameFolder({required String id, required String name});
  Future<void> setFavorite({required String id, required bool favorite});
  Future<String> upload(
    UploadRequest request, {
    UploadProgressCallback? onProgress,
  });
}
