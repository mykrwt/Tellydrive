class AdminTotals {
  const AdminTotals({
    required this.users,
    required this.files,
    required this.folders,
    required this.bytes,
    required this.images,
    required this.videos,
    required this.documents,
  });

  final int bytes;
  final int documents;
  final int files;
  final int folders;
  final int images;
  final int users;
  final int videos;
}

class AdminUser {
  const AdminUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.createdAt,
    required this.fileCount,
    required this.totalBytes,
    this.lastLoginAt,
  });

  final DateTime createdAt;
  final String email;
  final int fileCount;
  final String id;
  final DateTime? lastLoginAt;
  final String name;
  final String role;
  final int totalBytes;
}

class AdminOverview {
  const AdminOverview({
    required this.mode,
    required this.revision,
    required this.updatedAt,
    required this.totals,
    required this.users,
  });

  final String mode;
  final int revision;
  final AdminTotals totals;
  final DateTime updatedAt;
  final List<AdminUser> users;
}
