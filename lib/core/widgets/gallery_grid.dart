import 'package:flutter/material.dart';

import '../../features/library/domain/entities/media_item.dart';
import '../utils/date_formatters.dart';
import 'date_section_header.dart';
import 'thumbnail.dart';

/// Google Photos–style grid grouped by capture date, with a section header per
/// day. Built from slivers so it stays smooth while scrolling thousands of
/// thumbnails (thumbnails are themselves lazily loaded and cached).
class GalleryGrid extends StatelessWidget {
  const GalleryGrid({
    super.key,
    required this.items,
    required this.onItemTap,
    this.onItemLongPress,
    this.selectionMode = false,
    this.selectedIds = const {},
    this.onToggleSelection,
    this.padding = const EdgeInsets.symmetric(horizontal: 2),
  });

  final List<MediaItem> items;
  final void Function(MediaItem item, int index) onItemTap;
  final void Function(MediaItem item, int index)? onItemLongPress;
  final bool selectionMode;
  final Set<String> selectedIds;
  final void Function(MediaItem item)? onToggleSelection;
  final EdgeInsets padding;

  static const int columns = 3;

  @override
  Widget build(BuildContext context) {
    // Group items by calendar day, preserving the given (already sorted) order.
    final ordered = <String, List<MediaItem>>{};
    for (final item in items) {
      ordered.putIfAbsent(
        DateFormatters.key(item.displayDate),
        () => [],
      ).add(item);
    }

    final slivers = <Widget>[
      SliverPadding(padding: padding, sliver: SliverToBoxAdapter(child: SizedBox.shrink())),
    ];
    var index = 0;
    for (final entry in ordered.entries) {
      final dayItems = entry.value;
      final header = DateSectionHeader(DateFormatters.groupLabel(dayItems.first.displayDate));
      slivers.add(SliverToBoxAdapter(child: header));
      slivers.add(
        SliverPadding(
          padding: padding,
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: columns,
              mainAxisSpacing: 2,
              crossAxisSpacing: 2,
            ),
            delegate: SliverChildBuilderDelegate(
              (context, i) {
                final item = dayItems[i];
                final tileIndex = index++;
                return _MediaTile(
                  item: item,
                  selectionMode: selectionMode,
                  selected: selectedIds.contains(item.id),
                  onTap: () => onItemTap(item, tileIndex),
                  onLongPress: onItemLongPress == null
                      ? null
                      : () => onItemLongPress!(item, tileIndex),
                  onToggle: onToggleSelection == null
                      ? null
                      : () => onToggleSelection!(item),
                );
              },
              childCount: dayItems.length,
            ),
          ),
        ),
      );
    }
    return CustomScrollView(slivers: slivers);
  }
}

class _MediaTile extends StatelessWidget {
  const _MediaTile({
    required this.item,
    required this.onTap,
    this.onLongPress,
    this.selectionMode = false,
    this.selected = false,
    this.onToggle,
  });

  final MediaItem item;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final bool selectionMode;
  final bool selected;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final widget = selectionMode
        ? GestureDetector(
            onTap: onToggle,
            child: Stack(
              fit: StackFit.expand,
              children: [
                Thumbnail(item: item),
                if (selected)
                  Container(
                    color: colors.primary.withValues(alpha: 0.35),
                    alignment: Alignment.topRight,
                    padding: const EdgeInsets.all(6),
                    child: Icon(Icons.check_circle, color: colors.primary, size: 22),
                  ),
              ],
            ),
          )
        : GestureDetector(
            onTap: onTap,
            onLongPress: onLongPress,
            child: Thumbnail(item: item),
          );

    return Stack(
      fit: StackFit.expand,
      children: [
        widget,
        if (!selectionMode && item.favorite)
          Positioned(
            top: 4,
            right: 4,
            child: Icon(Icons.favorite, size: 16, color: Colors.white.withValues(alpha: 0.9)),
          ),
      ],
    );
  }
}
