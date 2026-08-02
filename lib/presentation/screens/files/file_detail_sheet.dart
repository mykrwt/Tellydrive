import 'dart:io';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/theme/app_theme.dart';
import '../../../domain/models/file_entry.dart';
import '../../../state/app_providers.dart';
import '../../widgets/telly_button.dart';

/// A translucent bottom sheet with a file's full metadata (name, size,
/// upload date, MIME type, checksum, chunk breakdown for split files) and
/// primary actions — Download, Share, Favorite, Delete — modeled on the
/// iOS "quick look" info panel.
class FileDetailSheet extends ConsumerStatefulWidget {
  const FileDetailSheet({super.key, required this.entry});
  final FileEntry entry;

  @override
  ConsumerState<FileDetailSheet> createState() => _FileDetailSheetState();
}

class _FileDetailSheetState extends ConsumerState<FileDetailSheet> {
  double? _progress;

  @override
  Widget build(BuildContext context) {
    final entry = widget.entry;
    return Container(
      margin: const EdgeInsets.only(top: 80),
      decoration: BoxDecoration(
        color: AppTheme.groupedBgOf(context),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 5,
                  decoration: BoxDecoration(
                    color: AppTheme.tertiaryBgOf(context),
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(entry.originalName, style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 20),
              _MetaRow(label: 'Size', value: _humanSize(entry.sizeBytes)),
              _MetaRow(label: 'Type', value: entry.mimeType),
              _MetaRow(label: 'Folder', value: entry.folderPath),
              _MetaRow(
                label: 'Uploaded',
                value: entry.uploadedAt != null ? DateFormat.yMMMd().add_jm().format(entry.uploadedAt!) : '—',
              ),
              _MetaRow(label: 'Encrypted', value: entry.isEncrypted ? 'Yes (AES-256-GCM)' : 'No'),
              _MetaRow(label: 'Checksum (SHA-256)', value: '${entry.sha256.substring(0, 16)}…', monospace: true),
              _MetaRow(
                label: 'Chunks',
                value: entry.isMultiChunk ? '${entry.chunks.length} encrypted segments in Telegram' : '1 (single message)',
              ),
              const SizedBox(height: 24),
              if (_progress != null) ...[
                LinearProgressIndicator(value: _progress),
                const SizedBox(height: 16),
              ],
              Row(
                children: [
                  Expanded(
                    child: TellyButton(
                      label: entry.hasLocalCopy ? 'Open' : 'Download',
                      onPressed: entry.hasLocalCopy ? () {} : _download,
                    ),
                  ),
                  const SizedBox(width: 12),
                  IconButton.filledTonal(
                    icon: const Icon(CupertinoIcons.share),
                    onPressed: entry.localPath != null ? () => Share.shareXFiles([XFile(entry.localPath!)]) : null,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _download() async {
    final repo = await ref.read(fileRepositoryProvider.future);
    setState(() => _progress = 0);
    await for (final p in repo.downloadFile(entry: widget.entry, destinationDir: Directory.systemTemp)) {
      setState(() => _progress = p.fraction);
    }
    setState(() => _progress = null);
  }

  String _humanSize(int bytes) {
    if (bytes <= 0) return '0 KB';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var value = bytes.toDouble();
    var i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return '${value.toStringAsFixed(1)} ${units[i]}';
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.label, required this.value, this.monospace = false});
  final String label;
  final String value;
  final bool monospace;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Text(label, style: Theme.of(context).textTheme.bodyMedium),
          const Spacer(),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                fontFamily: monospace ? 'monospace' : null,
                color: AppTheme.secondaryLabelOf(context),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
