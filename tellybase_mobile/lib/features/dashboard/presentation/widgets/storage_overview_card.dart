import 'package:flutter/material.dart';
import 'package:tellybase_mobile/core/widgets/premium_card.dart';
import 'package:tellybase_mobile/features/dashboard/domain/entities/dashboard_summary.dart';

class StorageOverviewCard extends StatelessWidget {
  const StorageOverviewCard({required this.summary, super.key});

  final DashboardSummary summary;

  @override
  Widget build(BuildContext context) {
    final percent = (summary.storagePercent.clamp(0, 100)) / 100;
    return PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 45,
                height: 45,
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .primary
                      .withValues(alpha: 0.13),
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(
                  Icons.cloud_done_outlined,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Private storage', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 3),
                    Text(summary.storageModeLabel),
                  ],
                ),
              ),
              Text(
                summary.storageUsedLabel,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ],
          ),
          const SizedBox(height: 19),
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: LinearProgressIndicator(
              value: percent,
              minHeight: 8,
              backgroundColor: Colors.white.withValues(alpha: 0.06),
              valueColor: AlwaysStoppedAnimation<Color>(
                Theme.of(context).colorScheme.secondary,
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Text('${summary.fileCount} files · ${summary.folderCount} folders'),
              const Spacer(),
              Text(summary.storageRemainingLabel),
            ],
          ),
        ],
      ),
    );
  }
}
