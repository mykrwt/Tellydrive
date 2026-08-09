import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:open_filex/open_filex.dart';

import '../../../../core/utils/file_utils.dart';
import '../../../../services/files/file_action_service.dart';
import '../../../drive/domain/entities/drive_file.dart';
import '../../../drive/domain/entities/drive_folder.dart';
import '../../../drive/presentation/providers/drive_provider.dart';
import '../../../gallery/presentation/providers/gallery_provider.dart';
import '../../../gallery/presentation/screens/gallery_viewer_screen.dart';

class FilesScreen extends ConsumerStatefulWidget {
  const FilesScreen({super.key});

  @override
  ConsumerState<FilesScreen> createState() => _FilesScreenState();
}

class _FilesScreenState extends ConsumerState<FilesScreen> {
  final _search = TextEditingController();
  bool _atRoot = true;
  bool _busy = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  DriveFolder? _currentFolder(DriveState state) {
    for (final folder in state.folders) {
      if (folder.id == state.currentFolderId) return folder;
    }
    return null;
  }

  void _openFolder(DriveFolder folder) {
    setState(() {
      _atRoot = false;
      _search.clear();
    });
    ref.read(driveProvider.notifier)
      ..setSearchQuery('')
      ..clearSelection()
      ..switchFolder(folder.id);
  }

  void _goRoot() {
    setState(() {
      _atRoot = true;
      _search.clear();
    });
    ref.read(driveProvider.notifier)
      ..setSearchQuery('')
      ..clearSelection();
  }

  Future<void> _run(Future<void> Function() callback) async {
    setState(() => _busy = true);
    try {
      await callback();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.toString()), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickUpload(DriveState state) async {
    final selected = await FilePicker.platform.pickFiles(allowMultiple: true);
    if (selected == null || selected.files.isEmpty || !mounted) return;
    var destination = _atRoot ? null : state.currentFolderId;
    destination ??= await _chooseFolder(state, title: 'Upload to');
    if (destination == null) return;
    for (final file in selected.files) {
      if (file.path == null) continue;
      ref.read(uploadProvider.notifier).uploadFile(
        localPath: file.path!,
        fileName: file.name,
        folderId: destination,
      );
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Uploading ${selected.files.length} file(s) to Telegram')),
      );
    }
  }

  Future<String?> _chooseFolder(DriveState state, {required String title}) {
    return showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(title: Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700))),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              children: state.folders.map((folder) => ListTile(
                leading: Icon(folder.isSavedMessages ? Icons.bookmark_rounded : Icons.folder_rounded, color: Colors.amber.shade700),
                title: Text(folder.title),
                trailing: folder.id == state.currentFolderId && !_atRoot ? const Icon(Icons.check) : null,
                onTap: () => Navigator.pop(context, folder.id),
              )).toList(),
            ),
          ),
        ]),
      ),
    );
  }

  Future<void> _createFolder() async {
    final controller = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Create Telegram folder'),
        content: TextField(
          controller: controller,
          autofocus: true,
          textInputAction: TextInputAction.done,
          decoration: const InputDecoration(labelText: 'Folder name'),
          onSubmitted: (value) => Navigator.pop(context, value),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, controller.text), child: const Text('Create')),
        ],
      ),
    );
    controller.dispose();
    if (value == null || value.trim().isEmpty) return;
    await _run(() async {
      await ref.read(driveProvider.notifier).createFolder(value);
    });
  }

  Future<void> _renameFile(DriveFile file) async {
    final name = await _nameDialog('Rename file', file.name);
    if (name == null || name == file.name) return;
    await _run(() async {
      await ref.read(driveRepositoryProvider).renameFile(file, name);
      await ref.read(driveProvider.notifier).loadFiles();
      await ref.read(galleryProvider.notifier).refresh();
      ref.read(driveProvider.notifier).clearSelection();
    });
  }

  Future<void> _renameFolder(DriveFolder folder) async {
    final name = await _nameDialog('Rename folder', folder.title);
    if (name == null || name == folder.title) return;
    await _run(() async {
      await ref.read(driveRepositoryProvider).renameFolder(folder, name);
      await ref.read(driveProvider.notifier).loadFolders();
    });
  }

  Future<String?> _nameDialog(String title, String initial) async {
    final controller = TextEditingController(text: initial);
    controller.selection = TextSelection(baseOffset: 0, extentOffset: initial.lastIndexOf('.') > 0 ? initial.lastIndexOf('.') : initial.length);
    final value = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(controller: controller, autofocus: true, onSubmitted: (value) => Navigator.pop(context, value)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, controller.text.trim()), child: const Text('Save')),
        ],
      ),
    );
    controller.dispose();
    return value?.trim();
  }

  Future<void> _deleteFiles(List<DriveFile> files) async {
    if (files.isEmpty) return;
    final yes = await _confirm(
      files.length == 1 ? 'Delete ${files.first.name}?' : 'Delete ${files.length} files?',
      'The corresponding Telegram messages will be permanently deleted.',
    );
    if (!yes) return;
    await _run(() async {
      await ref.read(driveRepositoryProvider).deleteFiles(files);
      ref.read(driveProvider.notifier).clearSelection();
      await ref.read(driveProvider.notifier).loadFiles();
      await ref.read(galleryProvider.notifier).refresh();
    });
  }

  Future<void> _deleteFolder(DriveFolder folder) async {
    if (folder.isSavedMessages) return;
    final yes = await _confirm('Delete ${folder.title}?', 'This leaves the Telegram channel. Files in that channel will no longer be shown.');
    if (!yes) return;
    await _run(() async {
      await ref.read(driveRepositoryProvider).deleteFolder(folder);
      await ref.read(driveProvider.notifier).loadFolders();
      await ref.read(galleryProvider.notifier).refresh();
    });
  }

  Future<bool> _confirm(String title, String message) async =>
      await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Colors.red),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Delete'),
            ),
          ],
        ),
      ) ?? false;

  Future<void> _moveOrCopy(List<DriveFile> files, DriveState state, {required bool move}) async {
    final destination = await _chooseFolder(state, title: move ? 'Move to' : 'Copy to');
    if (destination == null) return;
    await _run(() async {
      final repository = ref.read(driveRepositoryProvider);
      if (move) {
        await repository.moveFiles(files, destination);
      } else {
        await repository.copyFiles(files, destination);
      }
      ref.read(driveProvider.notifier).clearSelection();
      await ref.read(driveProvider.notifier).loadFiles();
      await ref.read(galleryProvider.notifier).refresh();
    });
  }

  Future<void> _download(List<DriveFile> files) async {
    await _run(() async {
      final repository = ref.read(driveRepositoryProvider);
      for (final file in files) {
        await FileActionService.downloadToDevice(repository, file);
      }
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved to Downloads/TeleDrive')));
    });
  }

  Future<void> _share(List<DriveFile> files) async {
    await _run(() => FileActionService.shareMany(
          ref.read(driveRepositoryProvider),
          files,
        ));
  }

  Future<void> _openFile(DriveFile file, List<DriveFile> visible) async {
    if (file.type == DriveFileType.image || file.type == DriveFileType.video) {
      final media = visible.where((item) => item.type == DriveFileType.image || item.type == DriveFileType.video).toList();
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => GalleryViewerScreen(media: media, initialIndex: media.indexOf(file)),
      ));
      return;
    }
    await _run(() async {
      final path = await ref.read(driveRepositoryProvider).downloadFile(file: file);
      final result = await OpenFilex.open(path);
      if (result.type != ResultType.done && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.message)));
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<UploadState>(uploadProvider, (previous, next) {
      final before = previous?.tasks.where((task) => task.isComplete).length ?? 0;
      final after = next.tasks.where((task) => task.isComplete).length;
      if (after > before) ref.read(galleryProvider.notifier).refresh();
    });
    final state = ref.watch(driveProvider);
    final uploads = ref.watch(uploadProvider);
    final files = state.filteredFiles;
    final currentFolder = _currentFolder(state);
    final selected = state.files.where((file) => state.selectedFileIds.contains(file.id)).toList();
    final query = _search.text.toLowerCase();
    final folders = state.folders.where((folder) => folder.title.toLowerCase().contains(query)).toList()
      ..sort((a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));

    return PopScope(
      canPop: _atRoot,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !_atRoot) _goRoot();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: !_atRoot
              ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: _goRoot)
              : state.isSelectionMode
                  ? IconButton(icon: const Icon(Icons.close), onPressed: ref.read(driveProvider.notifier).clearSelection)
                  : null,
          title: state.isSelectionMode
              ? Text('${state.selectedFileIds.length} selected')
              : Text(_atRoot ? 'Files' : (currentFolder?.title ?? 'Files'), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
          actions: [
            if (!state.isSelectionMode) ...[
              PopupMenuButton<SortOption>(
                tooltip: 'Sort',
                icon: const Icon(Icons.sort_rounded),
                initialValue: state.sortOption,
                onSelected: ref.read(driveProvider.notifier).setSort,
                itemBuilder: (_) => const [
                  PopupMenuItem(value: SortOption.nameAZ, child: Text('Name A–Z')),
                  PopupMenuItem(value: SortOption.nameZA, child: Text('Name Z–A')),
                  PopupMenuItem(value: SortOption.newest, child: Text('Newest')),
                  PopupMenuItem(value: SortOption.oldest, child: Text('Oldest')),
                  PopupMenuItem(value: SortOption.sizeDesc, child: Text('Largest')),
                  PopupMenuItem(value: SortOption.sizeAsc, child: Text('Smallest')),
                ],
              ),
              IconButton(
                tooltip: state.viewMode == ViewMode.list ? 'Grid view' : 'List view',
                onPressed: ref.read(driveProvider.notifier).toggleViewMode,
                icon: Icon(state.viewMode == ViewMode.list ? Icons.grid_view_rounded : Icons.view_list_rounded),
              ),
              PopupMenuButton<String>(
                onSelected: (value) {
                  if (value == 'folder') _createFolder();
                  if (value == 'upload') _pickUpload(state);
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'upload', child: ListTile(leading: Icon(Icons.upload_file), title: Text('Upload files'))),
                  PopupMenuItem(value: 'folder', child: ListTile(leading: Icon(Icons.create_new_folder_outlined), title: Text('Create folder'))),
                ],
              ),
            ],
          ],
        ),
        body: Stack(children: [
          Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 10),
              child: SearchBar(
                controller: _search,
                hintText: _atRoot ? 'Search Telegram folders' : 'Search files',
                leading: const Icon(Icons.search),
                trailing: _search.text.isNotEmpty ? [IconButton(icon: const Icon(Icons.close), onPressed: () {
                  _search.clear();
                  ref.read(driveProvider.notifier).setSearchQuery('');
                  setState(() {});
                })] : null,
                onChanged: (value) {
                  if (!_atRoot) ref.read(driveProvider.notifier).setSearchQuery(value);
                  setState(() {});
                },
              ),
            ),
            _UploadStrip(tasks: uploads.tasks),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _atRoot
                    ? ref.read(driveProvider.notifier).loadFolders
                    : () => ref.read(driveProvider.notifier).loadFiles(),
                child: _atRoot
                    ? _FolderList(
                        folders: folders,
                        loading: state.isLoadingFolders,
                        onOpen: _openFolder,
                        onRename: _renameFolder,
                        onDelete: _deleteFolder,
                      )
                    : _FileArea(
                        files: files,
                        loading: state.isLoadingFiles,
                        viewMode: state.viewMode,
                        selectedIds: state.selectedFileIds,
                        selectionMode: state.isSelectionMode,
                        onTap: (file) {
                          if (state.isSelectionMode) {
                            ref.read(driveProvider.notifier).toggleFileSelection(file.id);
                          } else {
                            _openFile(file, files);
                          }
                        },
                        onLongPress: (file) => ref.read(driveProvider.notifier).toggleFileSelection(file.id),
                        onMenu: (action, file) {
                          if (action == 'rename') _renameFile(file);
                          if (action == 'download') _download([file]);
                          if (action == 'share') _share([file]);
                          if (action == 'copy') _moveOrCopy([file], state, move: false);
                          if (action == 'move') _moveOrCopy([file], state, move: true);
                          if (action == 'delete') _deleteFiles([file]);
                        },
                      ),
              ),
            ),
          ]),
          if (_busy) const Positioned.fill(child: ColoredBox(color: Color(0x55000000), child: Center(child: CircularProgressIndicator()))),
        ]),
        floatingActionButton: state.isSelectionMode || _busy
            ? null
            : FloatingActionButton.extended(
                onPressed: () => _pickUpload(state),
                icon: const Icon(Icons.add),
                label: const Text('Upload'),
              ),
        bottomNavigationBar: state.isSelectionMode
            ? SafeArea(
                child: SizedBox(
                  height: 62,
                  child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                    IconButton(tooltip: 'Share', onPressed: selected.isEmpty ? null : () => _share(selected), icon: const Icon(Icons.share_outlined)),
                    IconButton(tooltip: 'Download', onPressed: selected.isEmpty ? null : () => _download(selected), icon: const Icon(Icons.download_outlined)),
                    IconButton(tooltip: 'Copy', onPressed: selected.isEmpty ? null : () => _moveOrCopy(selected, state, move: false), icon: const Icon(Icons.copy_outlined)),
                    IconButton(tooltip: 'Move', onPressed: selected.isEmpty ? null : () => _moveOrCopy(selected, state, move: true), icon: const Icon(Icons.drive_file_move_outline)),
                    IconButton(tooltip: 'Delete', onPressed: selected.isEmpty ? null : () => _deleteFiles(selected), icon: const Icon(Icons.delete_outline, color: Colors.red)),
                  ]),
                ),
              )
            : null,
      ),
    );
  }
}

class _FolderList extends StatelessWidget {
  const _FolderList({required this.folders, required this.loading, required this.onOpen, required this.onRename, required this.onDelete});
  final List<DriveFolder> folders;
  final bool loading;
  final ValueChanged<DriveFolder> onOpen;
  final ValueChanged<DriveFolder> onRename;
  final ValueChanged<DriveFolder> onDelete;

  @override
  Widget build(BuildContext context) {
    if (loading && folders.isEmpty) return const Center(child: CircularProgressIndicator());
    if (folders.isEmpty) return ListView(children: const [SizedBox(height: 150), Icon(Icons.folder_off_outlined, size: 54), SizedBox(height: 10), Text('No Telegram storage folders', textAlign: TextAlign.center)]);
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 100),
      itemCount: folders.length,
      separatorBuilder: (_, __) => const Divider(height: 1, indent: 66),
      itemBuilder: (context, index) {
        final folder = folders[index];
        return ListTile(
          leading: Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(color: Colors.amber.withValues(alpha: .16), borderRadius: BorderRadius.circular(10)),
            child: Icon(folder.isSavedMessages ? Icons.bookmark_rounded : Icons.folder_rounded, color: Colors.amber.shade700, size: 30),
          ),
          title: Text(folder.title, maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: Text(folder.isSavedMessages ? 'Telegram personal storage' : 'Telegram channel folder'),
          onTap: () => onOpen(folder),
          trailing: folder.isSavedMessages
              ? const Icon(Icons.chevron_right)
              : PopupMenuButton<String>(
                  onSelected: (value) => value == 'rename' ? onRename(folder) : onDelete(folder),
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'rename', child: Text('Rename')),
                    PopupMenuItem(value: 'delete', child: Text('Delete')),
                  ],
                ),
        );
      },
    );
  }
}

class _FileArea extends StatelessWidget {
  const _FileArea({
    required this.files,
    required this.loading,
    required this.viewMode,
    required this.selectedIds,
    required this.selectionMode,
    required this.onTap,
    required this.onLongPress,
    required this.onMenu,
  });
  final List<DriveFile> files;
  final bool loading;
  final ViewMode viewMode;
  final Set<String> selectedIds;
  final bool selectionMode;
  final ValueChanged<DriveFile> onTap;
  final ValueChanged<DriveFile> onLongPress;
  final void Function(String action, DriveFile file) onMenu;

  @override
  Widget build(BuildContext context) {
    if (loading && files.isEmpty) return const Center(child: CircularProgressIndicator());
    if (files.isEmpty) return ListView(children: const [SizedBox(height: 150), Icon(Icons.inventory_2_outlined, size: 54), SizedBox(height: 10), Text('This Telegram folder is empty', textAlign: TextAlign.center)]);
    if (viewMode == ViewMode.grid) {
      return GridView.builder(
        padding: const EdgeInsets.fromLTRB(10, 4, 10, 110),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, childAspectRatio: .72, mainAxisSpacing: 10, crossAxisSpacing: 8),
        itemCount: files.length,
        itemBuilder: (context, index) => _FileGridTile(
          file: files[index],
          selected: selectedIds.contains(files[index].id),
          selectionMode: selectionMode,
          onTap: () => onTap(files[index]),
          onLongPress: () => onLongPress(files[index]),
          onMenu: (value) => onMenu(value, files[index]),
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.only(bottom: 110),
      itemCount: files.length,
      separatorBuilder: (_, __) => const Divider(height: 1, indent: 72),
      itemBuilder: (context, index) {
        final file = files[index];
        return _FileListTile(
          file: file,
          selected: selectedIds.contains(file.id),
          selectionMode: selectionMode,
          onTap: () => onTap(file),
          onLongPress: () => onLongPress(file),
          onMenu: (value) => onMenu(value, file),
        );
      },
    );
  }
}

const _fileActions = <PopupMenuEntry<String>>[
  PopupMenuItem(value: 'rename', child: Text('Rename')),
  PopupMenuItem(value: 'copy', child: Text('Copy')),
  PopupMenuItem(value: 'move', child: Text('Move')),
  PopupMenuItem(value: 'download', child: Text('Download')),
  PopupMenuItem(value: 'share', child: Text('Share')),
  PopupMenuItem(value: 'delete', child: Text('Delete')),
];

IconData _fileIcon(DriveFileType type) => switch (type) {
  DriveFileType.image => Icons.image_outlined,
  DriveFileType.video => Icons.movie_outlined,
  DriveFileType.audio => Icons.audio_file_outlined,
  DriveFileType.pdf => Icons.picture_as_pdf_outlined,
  DriveFileType.document => Icons.description_outlined,
  DriveFileType.archive => Icons.folder_zip_outlined,
  DriveFileType.other => Icons.insert_drive_file_outlined,
};

Color _fileColor(DriveFileType type) => switch (type) {
  DriveFileType.image => Colors.purple,
  DriveFileType.video => Colors.red,
  DriveFileType.audio => Colors.orange,
  DriveFileType.pdf => Colors.red.shade700,
  DriveFileType.document => Colors.blue,
  DriveFileType.archive => Colors.amber.shade800,
  DriveFileType.other => Colors.blueGrey,
};

class _FileListTile extends ConsumerStatefulWidget {
  const _FileListTile({required this.file, required this.selected, required this.selectionMode, required this.onTap, required this.onLongPress, required this.onMenu});
  final DriveFile file;
  final bool selected;
  final bool selectionMode;
  final VoidCallback onTap;
  final VoidCallback onLongPress;
  final ValueChanged<String> onMenu;

  @override
  ConsumerState<_FileListTile> createState() => _FileListTileState();
}

class _FileListTileState extends ConsumerState<_FileListTile> {
  Future<String?>? thumbnail;
  @override
  void initState() {
    super.initState();
    if (widget.file.type == DriveFileType.image || widget.file.type == DriveFileType.video) {
      thumbnail = ref.read(driveRepositoryProvider).downloadThumbnail(widget.file);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListTile(
      selected: widget.selected,
      leading: widget.selectionMode
          ? Checkbox(value: widget.selected, onChanged: (_) => widget.onTap())
          : _FileVisual(file: widget.file, thumbnail: thumbnail, size: 48),
      title: Text(widget.file.name, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text('${SizeFormatter.format(widget.file.size)}  •  ${DateFormat('MMM d, yyyy HH:mm').format(widget.file.uploadedAt)}${widget.file.isChunked ? '  •  Chunked' : ''}'),
      onTap: widget.onTap,
      onLongPress: widget.onLongPress,
      trailing: widget.selectionMode ? null : PopupMenuButton<String>(onSelected: widget.onMenu, itemBuilder: (_) => _fileActions),
    );
  }
}

class _FileGridTile extends ConsumerStatefulWidget {
  const _FileGridTile({required this.file, required this.selected, required this.selectionMode, required this.onTap, required this.onLongPress, required this.onMenu});
  final DriveFile file;
  final bool selected;
  final bool selectionMode;
  final VoidCallback onTap;
  final VoidCallback onLongPress;
  final ValueChanged<String> onMenu;

  @override
  ConsumerState<_FileGridTile> createState() => _FileGridTileState();
}

class _FileGridTileState extends ConsumerState<_FileGridTile> {
  Future<String?>? thumbnail;
  @override
  void initState() {
    super.initState();
    if (widget.file.type == DriveFileType.image || widget.file.type == DriveFileType.video) {
      thumbnail = ref.read(driveRepositoryProvider).downloadThumbnail(widget.file);
    }
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: widget.onTap,
      onLongPress: widget.onLongPress,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: widget.selected ? Theme.of(context).colorScheme.primaryContainer : Theme.of(context).colorScheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(12),
          border: widget.selected ? Border.all(color: Theme.of(context).colorScheme.primary, width: 2) : null,
        ),
        child: Stack(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 12, 8, 7),
            child: Column(children: [
              Expanded(child: Center(child: _FileVisual(file: widget.file, thumbnail: thumbnail, size: 72))),
              const SizedBox(height: 7),
              Text(widget.file.name, maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, height: 1.15)),
              const SizedBox(height: 3),
              Text(SizeFormatter.format(widget.file.size), style: Theme.of(context).textTheme.labelSmall),
            ]),
          ),
          if (widget.selectionMode)
            Positioned(top: 5, right: 5, child: Checkbox(value: widget.selected, onChanged: (_) => widget.onTap()))
          else
            Positioned(top: 0, right: 0, child: PopupMenuButton<String>(iconSize: 18, padding: EdgeInsets.zero, onSelected: widget.onMenu, itemBuilder: (_) => _fileActions)),
        ]),
      ),
    );
  }
}

class _FileVisual extends StatelessWidget {
  const _FileVisual({required this.file, required this.thumbnail, required this.size});
  final DriveFile file;
  final Future<String?>? thumbnail;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (thumbnail == null) return Icon(_fileIcon(file.type), color: _fileColor(file.type), size: size * .75);
    return FutureBuilder<String?>(
      future: thumbnail,
      builder: (context, snapshot) {
        final path = snapshot.data;
        if (path != null && path.isNotEmpty && File(path).existsSync()) {
          return ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.file(File(path), width: size, height: size, fit: BoxFit.cover, cacheWidth: 240));
        }
        return Icon(_fileIcon(file.type), color: _fileColor(file.type), size: size * .75);
      },
    );
  }
}

class _UploadStrip extends ConsumerWidget {
  const _UploadStrip({required this.tasks});
  final List<UploadTask> tasks;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final visible = tasks.where((task) => !task.isComplete).toList();
    if (visible.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 58,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        scrollDirection: Axis.horizontal,
        itemCount: visible.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final task = visible[index];
          return Container(
            width: 230,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(color: task.hasError ? Colors.red.withValues(alpha: .12) : Theme.of(context).colorScheme.primaryContainer, borderRadius: BorderRadius.circular(9)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(task.fileName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12))),
                Text(task.hasError ? 'Failed' : '${(task.progress * 100).round()}%', style: const TextStyle(fontSize: 11)),
                if (task.hasError)
                  InkWell(
                    onTap: () => ref.read(uploadProvider.notifier).retryUpload(task.id),
                    child: const Padding(
                      padding: EdgeInsets.only(left: 6),
                      child: Icon(Icons.refresh, size: 17),
                    ),
                  ),
              ]),
              const SizedBox(height: 5),
              LinearProgressIndicator(value: task.hasError ? null : task.progress, color: task.hasError ? Colors.red : null),
            ]),
          );
        },
      ),
    );
  }
}
