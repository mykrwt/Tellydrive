import 'package:flutter/material.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_folder.dart';

class CloudFolderTile extends StatelessWidget {
  const CloudFolderTile({
    required this.folder,
    required this.grid,
    required this.onTap,
    required this.onMore,
    super.key,
  });

  final CloudFolder folder;
  final bool grid;
  final VoidCallback onMore;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    if (!grid) {
      return ListTile(
        contentPadding: const EdgeInsets.fromLTRB(18, 5, 8, 5),
        leading: Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            color: const Color(0xFFF0AF55).withValues(alpha: 0.13),
            borderRadius: BorderRadius.circular(15),
          ),
          child: const Icon(Icons.folder_rounded, color: Color(0xFFF0AF55)),
        ),
        title: Text(folder.name, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text('${folder.itemCount} ${folder.itemCount == 1 ? 'item' : 'items'}'),
        trailing: IconButton(onPressed: onMore, icon: const Icon(Icons.more_vert_rounded)),
        onTap: onTap,
      );
    }
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap,
      onLongPress: onMore,
      child: Container(
        padding: const EdgeInsets.all(15),
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
                const Icon(Icons.folder_rounded, color: Color(0xFFF0AF55), size: 38),
                const Spacer(),
                IconButton(
                  onPressed: onMore,
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.more_horiz_rounded),
                ),
              ],
            ),
            const Spacer(),
            Text(folder.name, maxLines: 2, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 5),
            Text('${folder.itemCount} items', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
