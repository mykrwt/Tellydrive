import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tellybase_mobile/core/utils/file_formatters.dart';
import 'package:tellybase_mobile/core/widgets/empty_state.dart';
import 'package:tellybase_mobile/core/widgets/premium_card.dart';
import 'package:tellybase_mobile/features/admin/domain/entities/admin_overview.dart';
import 'package:tellybase_mobile/features/admin/presentation/controllers/admin_controller.dart';
import 'package:tellybase_mobile/features/admin/presentation/widgets/admin_stat_card.dart';
import 'package:tellybase_mobile/features/auth/presentation/controllers/auth_controller.dart';
import 'package:tellybase_mobile/features/dashboard/presentation/controllers/dashboard_controller.dart';
import 'package:tellybase_mobile/features/storage/presentation/controllers/upload_controller.dart';
import 'package:tellybase_mobile/features/storage/presentation/widgets/upload_queue_sheet.dart';

class AdminScreen extends ConsumerWidget {
  const AdminScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(adminControllerProvider);
    final currentUser = ref.watch(authControllerProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin workspace'),
        actions: [
          IconButton(
            tooltip: 'Admin upload',
            onPressed: () => _pickAdminFiles(context, ref),
            icon: const Icon(Icons.upload_file_outlined),
          ),
          IconButton(
            tooltip: 'Transfers',
            onPressed: () => UploadQueueSheet.show(context),
            icon: const Icon(Icons.swap_vert_circle_outlined),
          ),
        ],
      ),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => EmptyState(
          icon: Icons.admin_panel_settings_outlined,
          title: 'Admin workspace unavailable',
          message: error.toString(),
          action: FilledButton(
            onPressed: ref.read(adminControllerProvider.notifier).refresh,
            child: const Text('Try again'),
          ),
        ),
        data: (overview) => RefreshIndicator(
          onRefresh: ref.read(adminControllerProvider.notifier).refresh,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
            children: [
              Text('The whole instance, in your pocket.', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 8),
              Text(
                'Monitor storage health, review accounts, and manage trusted administrators.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 20),
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                childAspectRatio: 1.35,
                mainAxisSpacing: 11,
                crossAxisSpacing: 11,
                children: [
                  AdminStatCard(label: 'Users', value: '${overview.totals.users}', icon: Icons.people_alt_outlined, color: const Color(0xFF8995FF)),
                  AdminStatCard(label: 'Files', value: '${overview.totals.files}', icon: Icons.file_copy_outlined, color: const Color(0xFF58D5C9)),
                  AdminStatCard(label: 'Folders', value: '${overview.totals.folders}', icon: Icons.folder_outlined, color: const Color(0xFFF0AF55)),
                  AdminStatCard(label: 'Storage', value: FileFormatters.bytes(overview.totals.bytes), icon: Icons.storage_rounded, color: const Color(0xFFEE79AD)),
                ],
              ),
              const SizedBox(height: 18),
              PremiumCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text('Database status', style: Theme.of(context).textTheme.titleMedium),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.secondary.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(overview.mode.toUpperCase()),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _Meta(label: 'Revision', value: '#${overview.revision}'),
                    _Meta(label: 'Last update', value: FileFormatters.date(overview.updatedAt)),
                    _Meta(label: 'Photos', value: '${overview.totals.images}'),
                    _Meta(label: 'Videos', value: '${overview.totals.videos}'),
                    _Meta(label: 'Other files', value: '${overview.totals.documents}'),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Text('Accounts', style: Theme.of(context).textTheme.titleLarge),
                  const Spacer(),
                  Text('${overview.users.length} total'),
                ],
              ),
              const SizedBox(height: 10),
              ...overview.users.map(
                (user) => _UserCard(
                  user: user,
                  isCurrentUser: user.id == currentUser?.id,
                  onRoleChanged: (role) => ref.read(adminControllerProvider.notifier).setRole(user, role),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickAdminFiles(BuildContext context, WidgetRef ref) async {
    final result = await FilePicker.platform.pickFiles(allowMultiple: true);
    if (result == null || result.files.isEmpty || !context.mounted) return;
    final task = ref.read(uploadControllerProvider.notifier).uploadFiles(
          result.files,
          source: 'admin',
        );
    unawaited(UploadQueueSheet.show(context));
    final completed = await task;
    if (completed > 0) {
      await ref.read(adminControllerProvider.notifier).refresh();
      ref.invalidate(dashboardSummaryProvider);
    }
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(children: [Text(label), const Spacer(), Text(value, style: Theme.of(context).textTheme.titleSmall)]),
    );
  }
}

class _UserCard extends StatelessWidget {
  const _UserCard({required this.user, required this.isCurrentUser, required this.onRoleChanged});
  final bool isCurrentUser;
  final ValueChanged<String> onRoleChanged;
  final AdminUser user;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: PremiumCard(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.14),
              child: Text(user.name.isEmpty ? '?' : user.name[0].toUpperCase()),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${user.name}${isCurrentUser ? ' · You' : ''}', style: Theme.of(context).textTheme.titleSmall),
                  Text(user.email, maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 3),
                  Text('${user.fileCount} files · ${FileFormatters.bytes(user.totalBytes)}', style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            if (isCurrentUser)
              const Chip(label: Text('Admin'))
            else
              DropdownButton<String>(
                value: user.role == 'admin' ? 'admin' : 'user',
                underline: const SizedBox.shrink(),
                items: const [
                  DropdownMenuItem(value: 'user', child: Text('User')),
                  DropdownMenuItem(value: 'admin', child: Text('Admin')),
                ],
                onChanged: (value) {
                  if (value != null) onRoleChanged(value);
                },
              ),
          ],
        ),
      ),
    );
  }
}
