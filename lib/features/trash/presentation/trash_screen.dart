import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/utils/date_formatters.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/thumbnail.dart';
import '../../library/domain/entities/media_item.dart';
import '../../library/presentation/library_controller.dart';
import '../../library/presentation/library_selectors.dart';

/// Trashed items with per-item Restore / Delete-forever actions.
class TrashScreen extends ConsumerWidget {
  const TrashScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(trashedItemsProvider);
    final controller = ref.read(libraryControllerProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Trash', style: TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          if (items.isNotEmpty)
            TextButton(
              onPressed: () async {
                final ok = await _confirmPermanentDelete(context, items.length);
                if (ok) await controller.permanentlyDelete(items);
              },
              child: const Text('Empty trash'),
            ),
        ],
      ),
      body: items.isEmpty
          ? const EmptyState(
              icon: Icons.delete_outline,
              title: 'Trash is empty',
              subtitle: 'Deleted photos and videos appear here for 30 days.',
            )
          : ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: items.length,
              itemBuilder: (context, i) =>
                  _TrashTile(item: items[i], controller: controller),
            ),
    );
  }

  Future<bool> _confirmPermanentDelete(BuildContext context, int count) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Empty trash?'),
        content: Text(
          '$count items will be permanently deleted from your Telegram account. '
          'This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete forever'),
          ),
        ],
      ),
    );
    return result ?? false;
  }
}

class _TrashTile extends StatelessWidget {
  const _TrashTile({required this.item, required this.controller});

  final MediaItem item;
  final LibraryController controller;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: ListTile(
        leading: SizedBox(
          width: 56,
          height: 56,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Thumbnail(item: item),
          ),
        ),
        title: Text(
          item.fileName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(
          '${DateFormatters.groupLabel(item.displayDate)} · ${Formatters.bytes(item.size)}',
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.restore),
              tooltip: 'Restore',
              onPressed: () => controller.restore(item),
            ),
            IconButton(
              icon: const Icon(Icons.delete_forever, color: Colors.redAccent),
              tooltip: 'Delete forever',
              onPressed: () => controller.permanentlyDelete([item]),
            ),
          ],
        ),
      ),
    );
  }
}
