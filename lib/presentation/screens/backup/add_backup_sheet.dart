import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../state/app_providers.dart';

/// Manual backup entry point — lets the user pick any file (photo, video,
/// document, audio, or arbitrary "other" file) from the OS file picker and
/// enqueue it for upload, satisfying the "manual backup option" and
/// "back up any file type" requirements directly.
class AddBackupSheet extends ConsumerWidget {
  const AddBackupSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.groupedBgOf(context),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Back Up a File', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 20),
            _OptionTile(
              icon: CupertinoIcons.photo_on_rectangle,
              label: 'Photos & Videos',
              onTap: () => _pickAndEnqueue(context, ref, FileType.media, '/Camera'),
            ),
            _OptionTile(
              icon: CupertinoIcons.doc_text,
              label: 'Documents',
              onTap: () => _pickAndEnqueue(context, ref, FileType.custom, '/Documents',
                  extensions: const ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt']),
            ),
            _OptionTile(
              icon: CupertinoIcons.music_note,
              label: 'Audio',
              onTap: () => _pickAndEnqueue(context, ref, FileType.audio, '/Audio'),
            ),
            _OptionTile(
              icon: CupertinoIcons.doc_on_doc,
              label: 'Any File',
              onTap: () => _pickAndEnqueue(context, ref, FileType.any, '/Other'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickAndEnqueue(
    BuildContext context,
    WidgetRef ref,
    FileType type,
    String folder, {
    List<String>? extensions,
  }) async {
    final result = await FilePicker.platform.pickFiles(
      type: type,
      allowedExtensions: extensions,
      allowMultiple: true,
      withReadStream: false,
    );
    if (result == null) return;

    final engine = await ref.read(backupEngineProvider.future);
    for (final f in result.files) {
      if (f.path == null) continue;
      engine.enqueueUpload(file: File(f.path!), folderPath: folder);
    }
    if (context.mounted) Navigator.of(context).pop();
  }
}

class _OptionTile extends StatelessWidget {
  const _OptionTile({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(color: AppColors.systemBlue.withOpacity(0.15), borderRadius: BorderRadius.circular(10)),
        child: Icon(icon, color: AppColors.systemBlue),
      ),
      title: Text(label),
      trailing: const Icon(CupertinoIcons.chevron_right, size: 16),
      onTap: onTap,
    );
  }
}
