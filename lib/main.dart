import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/tellybase_app.dart';
import 'core/di/providers.dart';
import 'features/backup/backup_scheduler.dart';

/// TellyBase entrypoint.
///
/// 1. Initialises the backup scheduler (WorkManager) for background uploads.
/// 2. Wires up the [ProviderScope] (composition root).
/// 3. Shows the Material 3 app.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await BackupScheduler.ensureInitialised();

  runApp(const ProviderScope(child: TellybaseApp()));
}
