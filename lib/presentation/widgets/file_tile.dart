import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../../core/constants/app_constants.dart';
import '../../core/theme/app_theme.dart';
import '../../domain/models/file_entry.dart';

/// A single-row representation of a [FileEntry] used in Files/Search/
/// Favorites/Recents list views — icon, name, metadata line, sync-state
/// badge and a trailing action, styled like Apple's Files app rows.
class FileTile extends StatelessWidget {
  const FileTile({
    super.key,
    required this.entry,
    this.onTap,
    this.onFavoriteToggle,
    this.trailing,
  });

  final FileEntry entry;
  final VoidCallback? onTap;
  final VoidCallback? onFavoriteToggle;
  final Widget? trailing;

  IconData get _icon => switch (entry.category) {
        TellyFileCategory.photo => CupertinoIcons.photo,
        TellyFileCategory.video => CupertinoIcons.videocam,
        TellyFileCategory.document => CupertinoIcons.doc_text,
        TellyFileCategory.audio => CupertinoIcons.music_note,
        TellyFileCategory.other => CupertinoIcons.doc,
      };

  Color get _iconColor => switch (entry.category) {
        TellyFileCategory.photo => AppColors.systemBlue,
        TellyFileCategory.video => AppColors.systemPurple,
        TellyFileCategory.document => AppColors.systemOrange,
        TellyFileCategory.audio => AppColors.systemPink,
        TellyFileCategory.other => AppColors.systemTeal,
      };

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: _iconColor.withOpacity(0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(_icon, color: _iconColor, size: 22),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entry.originalName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w500),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Text(_humanSize(entry.sizeBytes), style: Theme.of(context).textTheme.bodySmall),
                      const SizedBox(width: 6),
                      Text('·', style: Theme.of(context).textTheme.bodySmall),
                      const SizedBox(width: 6),
                      _StatusBadge(status: entry.syncStatus),
                      if (entry.isMultiChunk) ...[
                        const SizedBox(width: 6),
                        Icon(CupertinoIcons.square_stack_3d_up, size: 12, color: AppTheme.secondaryLabelOf(context)),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            if (trailing != null) trailing!,
            if (onFavoriteToggle != null)
              IconButton(
                icon: Icon(
                  entry.isFavorite ? CupertinoIcons.star_fill : CupertinoIcons.star,
                  color: entry.isFavorite ? AppColors.systemYellow : AppTheme.secondaryLabelOf(context),
                  size: 20,
                ),
                onPressed: onFavoriteToggle,
              ),
          ],
        ),
      ),
    );
  }

  static String _humanSize(int bytes) {
    if (bytes <= 0) return '0 KB';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var value = bytes.toDouble();
    var unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    return '${value.toStringAsFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}';
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final SyncStatus status;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      SyncStatus.synced => ('Backed up', AppColors.systemGreen),
      SyncStatus.cloudOnly => ('Cloud only', AppColors.systemTeal),
      SyncStatus.uploading => ('Uploading…', AppColors.systemBlue),
      SyncStatus.downloading => ('Downloading…', AppColors.systemBlue),
      SyncStatus.pendingUpload => ('Waiting…', AppColors.systemOrange),
      SyncStatus.paused => ('Paused', AppColors.systemOrange),
      SyncStatus.failed => ('Failed', AppColors.systemRed),
    };
    return Text(label, style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w500));
  }
}
