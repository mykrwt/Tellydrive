class RecentUpload {
  const RecentUpload({
    required this.name,
    required this.createdAt,
    required this.createdLabel,
  });

  final DateTime createdAt;
  final String createdLabel;
  final String name;
}

class DashboardSummary {
  const DashboardSummary({
    required this.storageUsedBytes,
    required this.storageUsedLabel,
    required this.storagePercent,
    required this.storageRemainingLabel,
    required this.fileCount,
    required this.folderCount,
    required this.photoCount,
    required this.videoCount,
    required this.storageMode,
    required this.storageModeLabel,
    this.recentUpload,
  });

  final int fileCount;
  final int folderCount;
  final int photoCount;
  final RecentUpload? recentUpload;
  final String storageMode;
  final String storageModeLabel;
  final int storagePercent;
  final String storageRemainingLabel;
  final int storageUsedBytes;
  final String storageUsedLabel;
  final int videoCount;
}
