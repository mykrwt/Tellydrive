import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../data/local_db/local_database.dart';
import '../data/repositories/file_repository.dart';
import '../data/telegram/manifest_service.dart';
import '../data/telegram/telegram_auth_service.dart';
import '../data/telegram/telegram_vault_service.dart';
import '../services/backup/backup_engine.dart';
import '../services/connectivity/connectivity_service.dart';

/// Root dependency graph for TellyBase, wired with Riverpod.
///
/// Kept intentionally flat and explicit (no code generation, no service
/// locator magic) so anyone reading this file can trace exactly how a
/// button tap in the UI ends up talking to Telegram — there is no hidden
/// backend anywhere in this graph; every provider bottoms out in either
/// on-device storage or a direct MTProto call to Telegram's own servers
/// using the signed-in user's own session.

final telegramAuthServiceProvider = Provider<TelegramAuthService>((ref) {
  throw UnimplementedError('Overridden in main.dart after session dir is resolved.');
});

final telegramVaultServiceProvider = Provider<TelegramVaultService>((ref) {
  final auth = ref.watch(telegramAuthServiceProvider);
  return TelegramVaultService(auth);
});

final manifestServiceProvider = Provider<ManifestService>((ref) {
  final vault = ref.watch(telegramVaultServiceProvider);
  return ManifestService(vault);
});

final localDatabaseProvider = FutureProvider<LocalDatabase>((ref) async {
  return LocalDatabase.open();
});

final fileRepositoryProvider = FutureProvider<FileRepository>((ref) async {
  final db = await ref.watch(localDatabaseProvider.future);
  final vault = ref.watch(telegramVaultServiceProvider);
  final manifest = ref.watch(manifestServiceProvider);
  return FileRepository(db: db, vault: vault, manifest: manifest);
});

final connectivityServiceProvider = Provider<ConnectivityService>((ref) {
  final service = ConnectivityService();
  ref.onDispose(service.dispose);
  return service;
});

final backupEngineProvider = FutureProvider<BackupEngine>((ref) async {
  final repo = await ref.watch(fileRepositoryProvider.future);
  final connectivity = ref.watch(connectivityServiceProvider);
  final engine = BackupEngine(repository: repo, connectivity: connectivity);
  ref.onDispose(engine.dispose);
  return engine;
});

/// Resolves once at process start; used by main.dart to build the
/// overridden [telegramAuthServiceProvider] with a concrete session
/// directory before the widget tree is created.
Future<Directory> resolveSessionDirectory() async {
  final base = await getApplicationSupportDirectory();
  final dir = Directory('${base.path}/telegram_session');
  await dir.create(recursive: true);
  return dir;
}
