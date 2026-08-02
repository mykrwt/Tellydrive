import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../domain/models/file_entry.dart';
import '../../../state/file_list_providers.dart';
import '../../widgets/file_tile.dart';
import 'file_detail_sheet.dart';

/// Folder-based document browser — groups files by their virtual
/// `folderPath` (Documents, Downloads, Camera, custom folders, etc.),
/// mirroring the Apple Files app's Browse tab.
class FilesScreen extends ConsumerWidget {
  const FilesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filesAsync = ref.watch(allFilesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Files')),
      body: filesAsync.when(
        data: (files) {
          final byFolder = <String, List<FileEntry>>{};
          for (final f in files) {
            byFolder.putIfAbsent(f.folderPath, () => []).add(f);
          }
          if (byFolder.isEmpty) {
            return Center(
              child: Text('No files backed up yet', style: Theme.of(context).textTheme.bodyLarge),
            );
          }
          final folders = byFolder.keys.toList()..sort();
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: folders.length,
            itemBuilder: (context, i) {
              final folder = folders[i];
              final items = byFolder[folder]!;
              return _FolderCard(folderPath: folder, items: items);
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
      ),
    );
  }
}

class _FolderCard extends StatelessWidget {
  const _FolderCard({required this.folderPath, required this.items});
  final String folderPath;
  final List<FileEntry> items;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          leading: const Icon(CupertinoIcons.folder_fill, color: AppColors.systemBlue),
          title: Text(folderPath, style: Theme.of(context).textTheme.titleMedium),
          subtitle: Text('${items.length} item${items.length == 1 ? '' : 's'}'),
          children: items
              .map((entry) => Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: FileTile(
                      entry: entry,
                      onTap: () => showModalBottomSheet(
                        context: context,
                        isScrollControlled: true,
                        backgroundColor: Colors.transparent,
                        builder: (_) => FileDetailSheet(entry: entry),
                      ),
                    ),
                  ))
              .toList(),
        ),
      ),
    );
  }
}
