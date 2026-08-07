import 'package:flutter/material.dart';
import 'package:tellybase_mobile/core/utils/file_formatters.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_file.dart';
import 'package:tellybase_mobile/features/storage/presentation/widgets/authenticated_image.dart';
import 'package:tellybase_mobile/features/storage/presentation/widgets/file_kind_icon.dart';

class CloudFileTile extends StatelessWidget {
  const CloudFileTile({
    required this.file,
    required this.grid,
    required this.onTap,
    required this.onMore,
    super.key,
  });

  final CloudFile file;
  final bool grid;
  final VoidCallback onMore;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    if (!grid) {
      return ListTile(
        contentPadding: const EdgeInsets.fromLTRB(18, 5, 8, 5),
        leading: file.kind == CloudFileKind.image && file.hasThumbnail
            ? SizedBox(
                width: 52,
                height: 52,
                child: AuthenticatedImage(
                  path: '/api/files/${Uri.encodeComponent(file.id)}?thumbnail=1',
                  borderRadius: BorderRadius.circular(15),
                ),
              )
            : FileKindIcon(file: file, size: 52),
        title: Text(file.name, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text('${FileFormatters.bytes(file.size)} · ${FileFormatters.date(file.createdAt)}'),
        trailing: IconButton(
          tooltip: 'File actions',
          onPressed: onMore,
          icon: const Icon(Icons.more_vert_rounded),
        ),
        onTap: onTap,
      );
    }
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap,
      onLongPress: onMore,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainer,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                FileKindIcon(file: file, size: 46),
                const Spacer(),
                IconButton(
                  onPressed: onMore,
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.more_horiz_rounded),
                ),
              ],
            ),
            const Spacer(),
            Text(file.name, maxLines: 2, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 5),
            Text(FileFormatters.bytes(file.size), style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
