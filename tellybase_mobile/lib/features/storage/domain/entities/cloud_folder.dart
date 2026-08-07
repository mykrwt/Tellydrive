class CloudFolder {
  const CloudFolder({
    required this.id,
    required this.name,
    required this.createdAt,
    this.parentId,
    this.itemCount = 0,
  });

  final DateTime createdAt;
  final String id;
  final int itemCount;
  final String name;
  final String? parentId;
}

class FolderContents {
  const FolderContents({
    required this.folderId,
    required this.folders,
    required this.files,
    required this.path,
  });

  final List<CloudFile> files;
  final String? folderId;
  final List<CloudFolder> folders;
  final List<CloudFolder> path;
}
