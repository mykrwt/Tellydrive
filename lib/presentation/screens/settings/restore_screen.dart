import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../state/app_providers.dart';
import '../../widgets/telly_button.dart';

/// "Restore all backups after logging into another phone" and "recognize
/// files it uploaded" made concrete: this screen kicks off the manifest
/// fast-path restore (or full vault scan fallback) and shows progress
/// while TellyBase rebuilds its local encrypted index purely from the
/// user's own Telegram account.
class RestoreScreen extends ConsumerStatefulWidget {
  const RestoreScreen({super.key});

  @override
  ConsumerState<RestoreScreen> createState() => _RestoreScreenState();
}

class _RestoreScreenState extends ConsumerState<RestoreScreen> {
  bool _running = false;
  String _status = '';
  int _filesFound = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Restore')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(CupertinoIcons.arrow_2_circlepath, size: 48, color: AppColors.systemBlue),
            const SizedBox(height: 16),
            Text('Rebuild your library', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 8),
            Text(
              'TellyBase reads the encrypted manifest pinned in your TellyBase '
              'vault chat and rebuilds your entire file index — photos, videos, '
              'documents, everything — exactly as it was, without any server.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 24),
            if (_running) ...[
              const LinearProgressIndicator(),
              const SizedBox(height: 12),
              Text(_status, style: Theme.of(context).textTheme.bodySmall),
            ] else
              TellyButton(label: 'Start Restore', onPressed: _startRestore),
            if (!_running && _filesFound > 0) ...[
              const SizedBox(height: 16),
              Text('Restored $_filesFound files.', style: Theme.of(context).textTheme.bodyMedium),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _startRestore() async {
    setState(() {
      _running = true;
      _status = 'Connecting to your Telegram vault…';
    });

    final repo = await ref.read(fileRepositoryProvider.future);
    setState(() => _status = 'Reading manifest…');
    final result = await repo.restoreFromVault();

    setState(() {
      _running = false;
      _filesFound = result.filesRestored;
      _status = 'Done';
    });
  }
}
