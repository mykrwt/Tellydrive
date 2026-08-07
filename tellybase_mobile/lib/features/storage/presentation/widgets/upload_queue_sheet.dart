import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tellybase_mobile/features/storage/presentation/controllers/upload_controller.dart';

class UploadQueueSheet extends ConsumerWidget {
  const UploadQueueSheet({super.key});

  static Future<void> show(BuildContext context) => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => const UploadQueueSheet(),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queue = ref.watch(uploadControllerProvider);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text('Transfers', style: Theme.of(context).textTheme.titleLarge),
                const Spacer(),
                TextButton(
                  onPressed: queue.isEmpty
                      ? null
                      : () => ref
                          .read(uploadControllerProvider.notifier)
                          .dismissFinished(),
                  child: const Text('Clear finished'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (queue.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: Text('No active transfers')),
              )
            else
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 420),
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: queue.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final item = queue[index];
                    return Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.surfaceContainer,
                        borderRadius: BorderRadius.circular(17),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                switch (item.status) {
                                  UploadStatus.complete => Icons.check_circle_rounded,
                                  UploadStatus.failed => Icons.error_rounded,
                                  _ => Icons.cloud_upload_outlined,
                                },
                                size: 20,
                                color: switch (item.status) {
                                  UploadStatus.complete => Theme.of(context).colorScheme.secondary,
                                  UploadStatus.failed => Theme.of(context).colorScheme.error,
                                  _ => Theme.of(context).colorScheme.primary,
                                },
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  item.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context).textTheme.titleSmall,
                                ),
                              ),
                              Text('${(item.progress * 100).round()}%'),
                            ],
                          ),
                          const SizedBox(height: 10),
                          LinearProgressIndicator(value: item.progress),
                          if (item.error != null) ...[
                            const SizedBox(height: 8),
                            Text(
                              item.error!,
                              style: TextStyle(color: Theme.of(context).colorScheme.error),
                            ),
                          ],
                        ],
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}
