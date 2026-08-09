import '../entities/drive_file.dart';
import '../entities/drive_folder.dart';

abstract class DriveRepository {
  /// Get real files from Saved Messages or a Telegram channel folder.
  Future<List<DriveFile>> getFiles({String? folderId});

  /// Get Telegram-backed folders (Saved Messages and writable channels).
  Future<List<DriveFolder>> getFolders();

  /// Uploads directly when Telegram accepts the file, otherwise uploads a
  /// resumable set of hidden chunks and one manifest.
  Future<DriveFile> uploadFile({
    required String localPath,
    required String fileName,
    required String folderId,
    void Function(double progress)? onProgress,
  });

  /// Download locally. Chunked files are reconstructed before this completes.
  Future<String> downloadFile({
    required DriveFile file,
    void Function(double progress)? onProgress,
  });

  Future<String?> downloadThumbnail(DriveFile file);

  Future<void> deleteFile(DriveFile file);
  Future<void> deleteFiles(List<DriveFile> files);

  Future<DriveFile> renameFile(DriveFile file, String newName);
  Future<List<DriveFile>> copyFiles(
      List<DriveFile> files, String destinationFolderId,
      {void Function(double progress)? onProgress});
  Future<List<DriveFile>> moveFiles(
      List<DriveFile> files, String destinationFolderId,
      {void Function(double progress)? onProgress});

  Future<DriveFolder> createFolder(String name);
  Future<DriveFolder> renameFolder(DriveFolder folder, String newName);
  Future<void> deleteFolder(DriveFolder folder);

  Future<List<DriveFile>> searchFiles(String query, {String? folderId});
}
