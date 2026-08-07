import 'package:flutter/material.dart';
import 'package:tellybase_mobile/core/utils/file_formatters.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_file.dart';
import 'package:tellybase_mobile/features/storage/presentation/widgets/authenticated_image.dart';

class MediaTile extends StatelessWidget {
  const MediaTile({
    required this.file,
    required this.selected,
    required this.onTap,
    required this.onLongPress,
    this.grid = true,
    super.key,
  });

  final CloudFile file;
  final bool grid;
  final VoidCallback onLongPress;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    if (!grid) {
      return ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 5),
        leading: SizedBox(
          width: 58,
          height: 58,
          child: AuthenticatedImage(
            path: '/api/files/${Uri.encodeComponent(file.id)}?thumbnail=1',
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        title: Text(file.name, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text('${FileFormatters.bytes(file.size)} · ${FileFormatters.date(file.createdAt)}'),
        trailing: Icon(
          selected ? Icons.check_circle_rounded : Icons.chevron_right_rounded,
          color: selected ? Theme.of(context).colorScheme.primary : null,
        ),
        selected: selected,
        onTap: onTap,
        onLongPress: onLongPress,
      );
    }
    return GestureDetector(
      onTap: onTap,
      onLongPress: onLongPress,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainer,
          borderRadius: BorderRadius.circular(19),
          border: Border.all(
            color: selected
                ? Theme.of(context).colorScheme.primary
                : Colors.white.withValues(alpha: 0.06),
            width: selected ? 2 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  AuthenticatedImage(
                    path: '/api/files/${Uri.encodeComponent(file.id)}?thumbnail=1',
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
                  ),
                  if (file.kind == CloudFileKind.video)
                    const Center(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: Color(0x99000000),
                          shape: BoxShape.circle,
                        ),
                        child: Padding(
                          padding: EdgeInsets.all(8),
                          child: Icon(Icons.play_arrow_rounded, color: Colors.white),
                        ),
                      ),
                    ),
                  Positioned(
                    top: 8,
                    right: 8,
                    child: AnimatedOpacity(
                      opacity: selected || file.favorite ? 1 : 0,
                      duration: const Duration(milliseconds: 150),
                      child: Container(
                        padding: const EdgeInsets.all(5),
                        decoration: const BoxDecoration(
                          color: Color(0xBB090C14),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          selected
                              ? Icons.check_rounded
                              : Icons.favorite_rounded,
                          size: 15,
                          color: selected
                              ? Theme.of(context).colorScheme.primary
                              : const Color(0xFFFF7D9B),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(11, 9, 11, 10),
              child: Text(
                file.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelMedium,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
