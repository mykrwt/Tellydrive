import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../services/backup/backup_engine.dart';
import '../../../services/backup/backup_task.dart';
import '../../../state/app_providers.dart';
import '../../widgets/telly_button.dart';
import 'add_backup_sheet.dart';

/// Live view of every in-flight/queued/failed transfer, with per-item
/// pause/resume/retry/cancel controls — this is the "upload and download
/// progress" + "pause and resume" + "automatic retry" requirements made
/// visible to the user, similar to the Files app's activity view.
class BackupQueueScreen extends ConsumerWidget {
  const BackupQueueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final engineAsync = ref.watch(backupEngineProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Backup'),
        actions: [
          IconButton(
            icon: const Icon(CupertinoIcons.add_circled_solid),
            onPressed: () => showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              backgroundColor: Colors.transparent,
              builder: (_) => const AddBackupSheet(),
            ),
          ),
        ],
      ),
      body: engineAsync.when(
        data: (engine) => _QueueList(engine: engine),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
      ),
    );
  }
}

class _QueueList extends StatelessWidget {
  const _QueueList({required this.engine});
  final BackupEngine engine;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<Map<String, BackupTask>>(
      stream: engine.tasksStream,
      initialData: engine.tasks,
      builder: (context, snapshot) {
        final tasks = snapshot.data?.values.toList() ?? [];
        if (tasks.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(CupertinoIcons.tray_arrow_up, size: 56, color: AppTheme.secondaryLabelOf(context)),
                  const SizedBox(height: 16),
                  Text('Nothing queued', style: Theme.of(context).textTheme.bodyLarge),
                  const SizedBox(height: 8),
                  Text(
                    'Tap + to back up a photo, video, document, or any file to your Telegram vault.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: tasks.length,
          itemBuilder: (context, i) => _TaskCard(task: tasks[i], engine: engine),
        );
      },
    );
  }
}

class _TaskCard extends StatelessWidget {
  const _TaskCard({required this.task, required this.engine});
  final BackupTask task;
  final BackupEngine engine;

  @override
  Widget build(BuildContext context) {
    final name = task.direction == BackupDirection.upload
        ? task.sourceFile?.uri.pathSegments.last ?? 'File'
        : 'Downloading…';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  task.direction == BackupDirection.upload ? CupertinoIcons.arrow_up_circle : CupertinoIcons.arrow_down_circle,
                  color: AppColors.systemBlue,
                ),
                const SizedBox(width: 10),
                Expanded(child: Text(name, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodyLarge)),
                _StateLabel(state: task.state),
              ],
            ),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: task.progress,
                minHeight: 6,
                backgroundColor: AppTheme.tertiaryBgOf(context),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (task.lastError != null)
                  Expanded(
                    child: Text(
                      task.lastError!,
                      style: const TextStyle(color: AppColors.systemRed, fontSize: 12),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                if (task.state == BackupTaskState.running)
                  TextButton(onPressed: () => engine.pause(task.id), child: const Text('Pause')),
                if (task.state == BackupTaskState.paused)
                  TextButton(onPressed: () => engine.resume(task.id), child: const Text('Resume')),
                if (task.state == BackupTaskState.failed)
                  TextButton(onPressed: () => engine.retry(task.id), child: const Text('Retry')),
                if (!task.isTerminal)
                  TextButton(
                    onPressed: () => engine.cancel(task.id),
                    child: const Text('Cancel', style: TextStyle(color: AppColors.systemRed)),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StateLabel extends StatelessWidget {
  const _StateLabel({required this.state});
  final BackupTaskState state;

  @override
  Widget build(BuildContext context) {
    final (text, color) = switch (state) {
      BackupTaskState.queued => ('Waiting', AppColors.systemOrange),
      BackupTaskState.running => ('Active', AppColors.systemBlue),
      BackupTaskState.paused => ('Paused', AppColors.systemOrange),
      BackupTaskState.completed => ('Done', AppColors.systemGreen),
      BackupTaskState.failed => ('Failed', AppColors.systemRed),
      BackupTaskState.cancelled => ('Cancelled', AppColors.systemRed),
    };
    return Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 12));
  }
}
