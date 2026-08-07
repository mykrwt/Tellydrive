import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/transfers/transfer_controller.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/empty_state.dart';

/// Live view of uploads/downloads, progress bars and recent results.
class DownloadsScreen extends ConsumerWidget {
  const DownloadsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final transfers = ref.watch(transferControllerProvider);
    final colors = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Downloads', style: TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_sweep_outlined),
            tooltip: 'Clear finished',
            onPressed: () =>
                ref.read(transferControllerProvider.notifier).clearFinished(),
          ),
        ],
      ),
      body: transfers.isEmpty
          ? const EmptyState(
              icon: Icons.download_outlined,
              title: 'Nothing in progress',
              subtitle: 'Your uploads and downloads will appear here.',
            )
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: transfers.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, i) => _TransferTile(status: transfers[i]),
            ),
    );
  }
}

class _TransferTile extends StatelessWidget {
  const _TransferTile({required this.status});

  final TransferStatus status;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final IconData icon;
    final Color? iconColor;
    switch (status.state) {
      case TransferState.queued:
        icon = Icons.schedule;
        iconColor = colors.onSurfaceVariant;
      case TransferState.running:
        icon = status.kind == TransferKind.upload
            ? Icons.upload
            : Icons.download;
        iconColor = colors.primary;
      case TransferState.done:
        icon = Icons.check_circle;
        iconColor = Colors.green;
      case TransferState.failed:
        icon = Icons.error;
        iconColor = colors.error;
    }

    return Card(
      child: ListTile(
        leading: Icon(icon, color: iconColor),
        title: Text(status.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            if (status.state == TransferState.failed && status.error != null)
              Text(
                status.error!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: colors.error, fontSize: 12),
              )
            else
              LinearProgressIndicator(
                value: status.progress,
                minHeight: 6,
                borderRadius: BorderRadius.circular(3),
              ),
            const SizedBox(height: 4),
            Text(
              _label(status),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colors.onSurfaceVariant,
                  ),
            ),
          ],
        ),
      ),
    );
  }

  String _label(TransferStatus s) {
    if (s.state == TransferState.queued) return 'Queued';
    if (s.state == TransferState.done) return 'Complete · ${Formatters.bytes(s.total)}';
    if (s.state == TransferState.failed) return 'Failed';
    return '${Formatters.bytes(s.done)} / ${Formatters.bytes(s.total)} '
        '(${(s.progress * 100).toStringAsFixed(0)}%)';
  }
}
