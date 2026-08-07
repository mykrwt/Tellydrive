import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/date_formatters.dart';
import '../../../core/utils/formatters.dart';
import '../../library/presentation/library_selectors.dart';

/// Storage usage: total bytes, item count, and a per-month breakdown.
class StorageScreen extends ConsumerWidget {
  const StorageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(activeItemsProvider);
    final total = ref.watch(totalStorageProvider);
    final colors = Theme.of(context).colorScheme;

    // Per-month breakdown (newest first).
    final byMonth = <String, ({int bytes, int count})>{};
    for (final item in items) {
      final key = DateFormatters.monthLabel(item.displayDate);
      final cur = byMonth[key];
      byMonth[key] = (
        bytes: (cur?.bytes ?? 0) + item.size,
        count: (cur?.count ?? 0) + 1,
      );
    }
    final months = byMonth.entries.toList()
      ..sort((a, b) => b.key.compareTo(a.key));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Storage', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  Icon(Icons.cloud_done, size: 48, color: colors.primary),
                  const SizedBox(width: 16),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        Formatters.bytes(total),
                        style: Theme.of(context)
                            .textTheme
                            .headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        '${items.length} items backed up',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: colors.onSurfaceVariant,
                            ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text('By month',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          for (final m in months) ...[
            _MonthRow(
              label: m.key,
              bytes: m.value.bytes,
              count: m.value.count,
              fraction: total <= 0 ? 0 : m.value.bytes / total,
            ),
            const SizedBox(height: 4),
          ],
        ],
      ),
    );
  }
}

class _MonthRow extends StatelessWidget {
  const _MonthRow({
    required this.label,
    required this.bytes,
    required this.count,
    required this.fraction,
  });

  final String label;
  final int bytes;
  final int count;
  final double fraction;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: Text(label)),
            Text(
              '${Formatters.bytes(bytes)} · $count',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colors.onSurfaceVariant,
                  ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        LinearProgressIndicator(
          value: fraction.clamp(0.0, 1.0),
          minHeight: 6,
          borderRadius: BorderRadius.circular(3),
        ),
      ],
    );
  }
}
