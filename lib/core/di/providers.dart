import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/auth_state.dart';
import '../../features/backup/backup_controller.dart';
import '../../features/backup/backup_preferences.dart';
import '../../features/library/data/repositories/library_repository_impl.dart';
import '../../features/library/domain/entities/media_item.dart';
import '../../features/library/domain/repositories/library_repository.dart';
import '../../features/library/presentation/library_controller.dart';
import '../../features/settings/presentation/settings_controller.dart';
import '../../telegram/core/telegram_auth.dart';
import '../../telegram/core/telegram_core.dart';
import '../../telegram/mtproto/mtproto_auth.dart';
import '../../telegram/mtproto/mtproto_storage.dart';
import '../../telegram/mtproto/mtproto_transport.dart';
import '../config/app_config.dart';
import '../storage/session_storage.dart';

// ── Low-level: secure storage + transport ────────────────────────────────────

final sessionStorageProvider = Provider<SessionStorage>(
  (ref) => SecureSessionStorage(),
);

/// Owns the single MTProto connection. Created lazily; destroyed on sign-out.
final transportProvider = Provider<MtprotoTransport>((ref) {
  final transport = MtprotoTransport(
    apiId: AppConfig.telegramApiId,
    apiHash: AppConfig.telegramApiHash,
  );
  ref.onDispose(transport.disconnect);
  return transport;
});

final telegramAuthProvider = Provider<TelegramAuth>(
  (ref) => MtprotoAuth(
    transport: ref.watch(transportProvider),
    sessionStorage: ref.watch(sessionStorageProvider),
  ),
);

// ── Active engine: set by AuthController once a session exists ───────────────

final telegramCoreProvider = StateProvider<TelegramCore?>((ref) => null);

/// Storage-bound library repository. Throws [NotAuthenticatedException] before
/// sign-in; controllers guard against it.
final libraryRepositoryProvider = Provider<LibraryRepository>((ref) {
  final core = ref.watch(telegramCoreProvider);
  if (core == null) {
    // Returned instance is used only after auth; see LibraryController.
    throw StateError('TelegramCore is not initialised yet.');
  }
  return LibraryRepositoryImpl(storage: core.storage);
});

// ── SharedPreferences (non-sensitive settings & backup bookkeeping) ─────────

final preferencesProvider = FutureProvider<SharedPreferences>(
  (ref) => SharedPreferences.getInstance(),
);

final backupPreferencesProvider = FutureProvider<BackupPreferences>(
  (ref) async => BackupPreferences(await ref.watch(preferencesProvider.future)),
);

// ── Controllers ──────────────────────────────────────────────────────────────

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);

final libraryControllerProvider =
    AsyncNotifierProvider<LibraryController, List<MediaItem>>(LibraryController.new);

final settingsControllerProvider =
    NotifierProvider<SettingsController, SettingsState>(SettingsController.new);

final backupControllerProvider =
    NotifierProvider<BackupController, BackupState>(BackupController.new);
