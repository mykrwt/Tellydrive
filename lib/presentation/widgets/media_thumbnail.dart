import 'dart:io';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../../core/constants/app_constants.dart';
import '../../core/theme/app_theme.dart';
import '../../domain/models/file_entry.dart';

/// Renders a cached local thumbnail if available, otherwise a tasteful
/// placeholder tile with a small cloud-download glyph indicating the
/// original is stored in the user's Telegram vault and can be fetched on
/// tap — mirrors the "cloud item" affordance in Apple Photos/Files.
class MediaThumbnail extends StatelessWidget {
  const MediaThumbnail({super.key, required this.entry});
  final FileEntry entry;

  @override
  Widget build(BuildContext context) {
    final thumbPath = entry.thumbnailLocalPath;
    final hasThumb = thumbPath != null && File(thumbPath).existsSync();

    return Stack(
      fit: StackFit.expand,
      children: [
        if (hasThumb)
          Image.file(File(thumbPath), fit: BoxFit.cover)
        else
          Container(
            color: AppTheme.tertiaryBgOf(context),
            child: Icon(
              entry.category == TellyFileCategory.video ? CupertinoIcons.videocam_fill : CupertinoIcons.photo_fill,
              color: AppTheme.secondaryLabelOf(context),
            ),
          ),
        if (entry.syncStatus == SyncStatus.cloudOnly)
          const Positioned(
            right: 4,
            bottom: 4,
            child: Icon(CupertinoIcons.cloud_download_fill, color: Colors.white, size: 16, shadows: [
              Shadow(color: Colors.black45, blurRadius: 4),
            ]),
          ),
        if (entry.category == TellyFileCategory.video)
          const Positioned(
            left: 4,
            bottom: 4,
            child: Icon(CupertinoIcons.play_circle_fill, color: Colors.white, size: 16, shadows: [
              Shadow(color: Colors.black45, blurRadius: 4),
            ]),
          ),
      ],
    );
  }
}
