import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tellybase_mobile/core/di/providers.dart';
import 'package:tellybase_mobile/core/widgets/empty_state.dart';
import 'package:tellybase_mobile/features/dashboard/presentation/controllers/dashboard_controller.dart';
import 'package:tellybase_mobile/features/files/presentation/widgets/cloud_file_tile.dart';
import 'package:tellybase_mobile/features/files/presentation/widgets/cloud_folder_tile.dart';
import 'package:tellybase_mobile/features/gallery/presentation/widgets/media_viewer.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_file.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_folder.dart';
import 'package:tellybase_mobile/features/storage/presentation/controllers/files_controller.dart';
import 'package:tellybase_mobile/features/storage/presentation/controllers/upload_controller.dart';
import 'package:tellybase_mobile/features/storage/presentation/widgets/upload_queue_sheet.dart';

class FilesScreen extends ConsumerWidget {
  const FilesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(filesControllerProvider);
    final controller = ref.read(filesControllerProvider.notifier);
    final contents = state.contents;
    final currentName = contents == null || contents.path.isEmpty
        ? 'My Files'
        : contents.path.last.name;

    return PopScope(
      canPop: contents?.folderId == null,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && contents?.folderId != null) unawaited(controller.goUp());
      },
      child: Scaffold(
        appBar: AppBar(
          leading: contents?.folderId == null
              ? null
              : IconButton(
                  onPressed: controller.goUp,
                  icon: const Icon(Icons.arrow_back_rounded),
                ),
          title: Text(currentName),
          actions: [
            IconButton(
              tooltip: state.usesGrid ? 'List view' : 'Grid view',
              onPressed: controller.toggleView,
              icon: Icon(state.usesGrid ? Icons.view_agenda_outlined : Icons.grid_view_rounded),
            ),
            PopupMenuButton<String>(
              onSelected: (value) {
                if (value == 'folder') _createFolder(context, controller);
                if (value == 'upload') _pickFiles(context, ref, controller);
                if (value == 'transfers') UploadQueueSheet.show(context);
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'folder', child: ListTile(leading: Icon(Icons.create_new_folder_outlined), title: Text('New folder'))),
                PopupMenuItem(value: 'upload', child: ListTile(leading: Icon(Icons.upload_file_outlined), title: Text('Upload files'))),
                PopupMenuItem(value: 'transfers', child: ListTile(leading: Icon(Icons.swap_vert_circle_outlined), title: Text('Transfers'))),
              ],
            ),
          ],
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () => _pickFiles(context, ref, controller),
          icon: const Icon(Icons.upload_rounded),
          label: const Text('Upload'),
        ),
        body: RefreshIndicator(
          onRefresh: controller.refresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 10),
                sliver: SliverList.list(
                  children: [
                    if (contents != null) _Breadcrumbs(contents: contents.path, onOpen: controller.openFolder),
                    const SizedBox(height: 14),
                    TextField(
                      onChanged: controller.setSearch,
                      decoration: const InputDecoration(
                        hintText: 'Search this folder',
                        prefixIcon: Icon(Icons.search_rounded),
                      ),
                    ),
                    const SizedBox(height: 14),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: FileCategory.values.map((category) {
                          final label = switch (category) {
                            FileCategory.all => 'All',
                            FileCategory.documents => 'Documents',
                            FileCategory.media => 'Media',
                            FileCategory.audio => 'Audio',
                            FileCategory.archives => 'Archives',
                          };
                          return Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                              label: Text(label),
                              selected: state.category == category,
                              onSelected: (_) => controller.setCategory(category),
                            ),
                          );
                        }).toList(growable: false),
                      ),
                    ),
                    if (state.error != null) ...[
                      const SizedBox(height: 12),
                      Text(state.error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ],
                    const SizedBox(height: 12),
                  ],
                ),
              ),
              if (state.isLoading && contents == null)
                const SliverFillRemaining(child: Center(child: CircularProgressIndicator()))
              else if (state.visibleFolders.isEmpty && state.visibleFiles.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: EmptyState(
                    icon: Icons.folder_open_rounded,
                    title: state.search.isEmpty ? 'This folder is empty' : 'Nothing found',
                    message: state.search.isEmpty
                        ? 'Upload a file or create a folder to keep things organized.'
                        : 'Try a different search or category.',
                    action: state.search.isEmpty
                        ? OutlinedButton.icon(
                            onPressed: () => _createFolder(context, controller),
                            icon: const Icon(Icons.create_new_folder_outlined),
                            label: const Text('Create folder'),
                          )
                        : null,
                  ),
                )
              else ...[
                if (state.visibleFolders.isNotEmpty)
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(18, 6, 18, 10),
                    sliver: SliverToBoxAdapter(
                      child: Text('Folders', style: Theme.of(context).textTheme.titleMedium),
                    ),
                  ),
                if (state.visibleFolders.isNotEmpty)
                  _folderSliver(context, ref, state, controller),
                if (state.visibleFiles.isNotEmpty)
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(18, 22, 18, 8),
                    sliver: SliverToBoxAdapter(
                      child: Text('Files · ${state.visibleFiles.length}', style: Theme.of(context).textTheme.titleMedium),
                    ),
                  ),
                if (state.visibleFiles.isNotEmpty)
                  _fileSliver(context, ref, state, controller),
              ],
              const SliverToBoxAdapter(child: SizedBox(height: 100)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _fileSliver(
    BuildContext context,
    WidgetRef ref,
    FilesState state,
    FilesController controller,
  ) {
    if (!state.usesGrid) {
      return SliverList.builder(
        itemCount: state.visibleFiles.length,
        itemBuilder: (context, index) {
          final file = state.visibleFiles[index];
          return CloudFileTile(
            file: file,
            grid: false,
            onTap: () => _openFile(context, ref, file, controller),
            onMore: () => _fileActions(context, ref, file, controller),
          );
        },
      );
    }
    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: 18),
      sliver: SliverGrid.builder(
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 11,
          mainAxisSpacing: 11,
          childAspectRatio: 1.08,
        ),
        itemCount: state.visibleFiles.length,
        itemBuilder: (context, index) {
          final file = state.visibleFiles[index];
          return CloudFileTile(
            file: file,
            grid: true,
            onTap: () => _openFile(context, ref, file, controller),
            onMore: () => _fileActions(context, ref, file, controller),
          );
        },
      ),
    );
  }

  Widget _folderSliver(
    BuildContext context,
    WidgetRef ref,
    FilesState state,
    FilesController controller,
  ) {
    if (!state.usesGrid) {
      return SliverList.builder(
        itemCount: state.visibleFolders.length,
        itemBuilder: (context, index) {
          final folder = state.visibleFolders[index];
          return CloudFolderTile(
            folder: folder,
            grid: false,
            onTap: () => controller.openFolder(folder.id),
            onMore: () => _folderActions(context, folder, controller),
          );
        },
      );
    }
    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: 18),
      sliver: SliverGrid.builder(
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 11,
          mainAxisSpacing: 11,
          childAspectRatio: 1.25,
        ),
        itemCount: state.visibleFolders.length,
        itemBuilder: (context, index) {
          final folder = state.visibleFolders[index];
          return CloudFolderTile(
            folder: folder,
            grid: true,
            onTap: () => controller.openFolder(folder.id),
            onMore: () => _folderActions(context, folder, controller),
          );
        },
      ),
    );
  }

  Future<void> _createFolder(BuildContext context, FilesController controller) async {
    final name = await _textPrompt(context, title: 'New folder', label: 'Folder name');
    if (name == null || name.trim().isEmpty) return;
    try {
      await controller.createFolder(name);
    } catch (_) {
      if (context.mounted) _showError(context, 'Could not create the folder.');
    }
  }

  Future<void> _download(BuildContext context, WidgetRef ref, CloudFile file) async {
    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(SnackBar(content: Text('Downloading ${file.name}…')));
    try {
      final device = ref.read(deviceFileServiceProvider);
      final path = await device.createDownloadPath(file.name);
      await ref.read(cloudStorageRepositoryProvider).downloadFile(id: file.id, destinationPath: path);
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(
        SnackBar(
          content: Text('${file.name} is ready'),
          action: SnackBarAction(label: 'Open', onPressed: () => device.open(path)),
        ),
      );
      await device.open(path);
    } catch (error) {
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  Future<void> _fileActions(
    BuildContext context,
    WidgetRef ref,
    CloudFile file,
    FilesController controller,
  ) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(leading: const Icon(Icons.open_in_new_rounded), title: const Text('Open'), onTap: () => Navigator.pop(context, 'open')),
            ListTile(leading: const Icon(Icons.download_outlined), title: const Text('Download'), onTap: () => Navigator.pop(context, 'download')),
            ListTile(leading: const Icon(Icons.drive_file_rename_outline), title: const Text('Rename'), onTap: () => Navigator.pop(context, 'rename')),
            ListTile(leading: const Icon(Icons.drive_file_move_outline), title: const Text('Move'), onTap: () => Navigator.pop(context, 'move')),
            ListTile(leading: Icon(Icons.delete_outline, color: Theme.of(context).colorScheme.error), title: const Text('Delete'), onTap: () => Navigator.pop(context, 'delete')),
          ],
        ),
      ),
    );
    if (!context.mounted || action == null) return;
    try {
      if (action == 'open') await _openFile(context, ref, file, controller);
      if (action == 'download') await _download(context, ref, file);
      if (action == 'rename') {
        final name = await _textPrompt(context, title: 'Rename file', label: 'File name', initial: file.name);
        if (name != null && name.trim().isNotEmpty) await controller.renameFile(file.id, name);
      }
      if (action == 'move') {
        final destination = await _chooseFolder(context, await controller.getAllFolders());
        if (destination.$1) await controller.moveFile(file.id, destination.$2);
      }
      if (action == 'delete' && await _confirmDelete(context, file.name)) {
        await controller.deleteFile(file.id);
        ref.invalidate(dashboardSummaryProvider);
      }
    } catch (error) {
      if (context.mounted) _showError(context, error.toString());
    }
  }

  Future<void> _folderActions(
    BuildContext context,
    CloudFolder folder,
    FilesController controller,
  ) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(leading: const Icon(Icons.folder_open_outlined), title: const Text('Open'), onTap: () => Navigator.pop(context, 'open')),
            ListTile(leading: const Icon(Icons.drive_file_rename_outline), title: const Text('Rename'), onTap: () => Navigator.pop(context, 'rename')),
            ListTile(leading: const Icon(Icons.drive_file_move_outline), title: const Text('Move'), onTap: () => Navigator.pop(context, 'move')),
            ListTile(leading: Icon(Icons.delete_outline, color: Theme.of(context).colorScheme.error), title: const Text('Delete'), subtitle: const Text('Files inside move to the parent folder'), onTap: () => Navigator.pop(context, 'delete')),
          ],
        ),
      ),
    );
    if (!context.mounted || action == null) return;
    try {
      if (action == 'open') await controller.openFolder(folder.id);
      if (action == 'rename') {
        final name = await _textPrompt(context, title: 'Rename folder', label: 'Folder name', initial: folder.name);
        if (name != null && name.trim().isNotEmpty) await controller.renameFolder(folder.id, name);
      }
      if (action == 'move') {
        final folders = (await controller.getAllFolders()).where((item) => item.id != folder.id).toList();
        if (!context.mounted) return;
        final destination = await _chooseFolder(context, folders);
        if (destination.$1) await controller.moveFolder(folder.id, destination.$2);
      }
      if (action == 'delete' && await _confirmDelete(context, folder.name)) {
        await controller.deleteFolder(folder.id);
      }
    } catch (error) {
      if (context.mounted) _showError(context, error.toString());
    }
  }

  Future<void> _openFile(
    BuildContext context,
    WidgetRef ref,
    CloudFile file,
    FilesController controller,
  ) async {
    if (file.kind == CloudFileKind.image || file.kind == CloudFileKind.video) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => MediaViewer(
            files: [file],
            initialIndex: 0,
            onDownload: (item) => _download(context, ref, item),
            onFavorite: (item) async {
              await ref.read(cloudStorageRepositoryProvider).setFavorite(id: item.id, favorite: !item.favorite);
              await controller.refresh();
            },
          ),
        ),
      );
      return;
    }
    await _download(context, ref, file);
  }

  Future<void> _pickFiles(
    BuildContext context,
    WidgetRef ref,
    FilesController controller,
  ) async {
    final result = await FilePicker.platform.pickFiles(allowMultiple: true);
    if (result == null || result.files.isEmpty || !context.mounted) return;
    final task = ref.read(uploadControllerProvider.notifier).uploadFiles(
          result.files,
          source: 'files',
          folderId: ref.read(filesControllerProvider).contents?.folderId,
        );
    unawaited(UploadQueueSheet.show(context));
    final count = await task;
    if (count > 0) {
      await controller.refresh();
      ref.invalidate(dashboardSummaryProvider);
    }
  }

  Future<(bool, String?)> _chooseFolder(BuildContext context, List<CloudFolder> folders) async {
    final selected = await showModalBottomSheet<String?>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 520),
          child: ListView(
            shrinkWrap: true,
            children: [
              ListTile(
                leading: const Icon(Icons.home_outlined),
                title: const Text('My Files (root)'),
                onTap: () => Navigator.pop(context, '__root__'),
              ),
              ...folders.map(
                (folder) => ListTile(
                  leading: const Icon(Icons.folder_outlined),
                  title: Text(folder.name),
                  onTap: () => Navigator.pop(context, folder.id),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (selected == null) return (false, null);
    return (true, selected == '__root__' ? null : selected);
  }

  Future<bool> _confirmDelete(BuildContext context, String name) async =>
      await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('Delete $name?'),
          content: const Text('This action cannot be undone.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
          ],
        ),
      ) ??
      false;

  Future<String?> _textPrompt(
    BuildContext context, {
    required String title,
    required String label,
    String initial = '',
  }) async {
    final input = TextEditingController(text: initial);
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: input,
          autofocus: true,
          textInputAction: TextInputAction.done,
          decoration: InputDecoration(labelText: label),
          onSubmitted: (value) => Navigator.pop(context, value),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, input.text), child: const Text('Save')),
        ],
      ),
    );
    input.dispose();
    return result;
  }

  void _showError(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}

class _Breadcrumbs extends StatelessWidget {
  const _Breadcrumbs({required this.contents, required this.onOpen});
  final List<CloudFolder> contents;
  final ValueChanged<String?> onOpen;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          ActionChip(
            avatar: const Icon(Icons.home_outlined, size: 17),
            label: const Text('My Files'),
            onPressed: () => onOpen(null),
          ),
          for (final folder in contents) ...[
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 5),
              child: Icon(Icons.chevron_right_rounded, size: 18),
            ),
            ActionChip(label: Text(folder.name), onPressed: () => onOpen(folder.id)),
          ],
        ],
      ),
    );
  }
}
