import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tellybase_mobile/core/network/api_client.dart';
import 'package:tellybase_mobile/core/services/device_file_service.dart';
import 'package:tellybase_mobile/core/storage/preferences_storage.dart';
import 'package:tellybase_mobile/core/storage/secure_session_storage.dart';
import 'package:tellybase_mobile/features/admin/data/datasources/admin_remote_data_source.dart';
import 'package:tellybase_mobile/features/admin/data/repositories/admin_repository_impl.dart';
import 'package:tellybase_mobile/features/admin/domain/repositories/admin_repository.dart';
import 'package:tellybase_mobile/features/admin/domain/usecases/admin_usecases.dart';
import 'package:tellybase_mobile/features/auth/data/datasources/auth_remote_data_source.dart';
import 'package:tellybase_mobile/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:tellybase_mobile/features/auth/domain/repositories/auth_repository.dart';
import 'package:tellybase_mobile/features/auth/domain/usecases/auth_usecases.dart';
import 'package:tellybase_mobile/features/dashboard/data/datasources/dashboard_remote_data_source.dart';
import 'package:tellybase_mobile/features/dashboard/data/repositories/dashboard_repository_impl.dart';
import 'package:tellybase_mobile/features/dashboard/domain/repositories/dashboard_repository.dart';
import 'package:tellybase_mobile/features/dashboard/domain/usecases/get_dashboard_summary.dart';
import 'package:tellybase_mobile/features/storage/data/datasources/storage_remote_data_source.dart';
import 'package:tellybase_mobile/features/storage/data/repositories/cloud_storage_repository_impl.dart';
import 'package:tellybase_mobile/features/storage/domain/repositories/cloud_storage_repository.dart';
import 'package:tellybase_mobile/features/storage/domain/usecases/storage_usecases.dart';

final preferencesStorageProvider = Provider<PreferencesStorage>(
  (ref) => throw StateError('PreferencesStorage must be overridden at startup.'),
);

final sessionStorageProvider = Provider<SessionStorage>(
  (ref) => SecureSessionStorage(),
);

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(sessionStorage: ref.watch(sessionStorageProvider)),
);

final deviceFileServiceProvider = Provider<DeviceFileService>(
  (ref) => const DeviceFileService(),
);

// Authentication graph.
final authRemoteDataSourceProvider = Provider<AuthRemoteDataSource>(
  (ref) => AuthRemoteDataSource(ref.watch(apiClientProvider)),
);
final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepositoryImpl(
    ref.watch(authRemoteDataSourceProvider),
    ref.watch(sessionStorageProvider),
  ),
);
final restoreSessionProvider = Provider<RestoreSession>(
  (ref) => RestoreSession(ref.watch(authRepositoryProvider)),
);
final signInProvider = Provider<SignIn>(
  (ref) => SignIn(ref.watch(authRepositoryProvider)),
);
final signUpProvider = Provider<SignUp>(
  (ref) => SignUp(ref.watch(authRepositoryProvider)),
);
final signOutProvider = Provider<SignOut>(
  (ref) => SignOut(ref.watch(authRepositoryProvider)),
);

// Dashboard graph.
final dashboardRemoteDataSourceProvider = Provider<DashboardRemoteDataSource>(
  (ref) => DashboardRemoteDataSource(ref.watch(apiClientProvider)),
);
final dashboardRepositoryProvider = Provider<DashboardRepository>(
  (ref) => DashboardRepositoryImpl(ref.watch(dashboardRemoteDataSourceProvider)),
);
final getDashboardSummaryProvider = Provider<GetDashboardSummary>(
  (ref) => GetDashboardSummary(ref.watch(dashboardRepositoryProvider)),
);

// Cloud storage graph.
final storageRemoteDataSourceProvider = Provider<StorageRemoteDataSource>(
  (ref) => StorageRemoteDataSource(ref.watch(apiClientProvider)),
);
final cloudStorageRepositoryProvider = Provider<CloudStorageRepository>(
  (ref) => CloudStorageRepositoryImpl(ref.watch(storageRemoteDataSourceProvider)),
);
final getMediaPageProvider = Provider<GetMediaPage>(
  (ref) => GetMediaPage(ref.watch(cloudStorageRepositoryProvider)),
);
final getFolderContentsProvider = Provider<GetFolderContents>(
  (ref) => GetFolderContents(ref.watch(cloudStorageRepositoryProvider)),
);
final storageCommandsProvider = Provider<StorageCommands>(
  (ref) => StorageCommands(ref.watch(cloudStorageRepositoryProvider)),
);

// Administration graph.
final adminRemoteDataSourceProvider = Provider<AdminRemoteDataSource>(
  (ref) => AdminRemoteDataSource(ref.watch(apiClientProvider)),
);
final adminRepositoryProvider = Provider<AdminRepository>(
  (ref) => AdminRepositoryImpl(ref.watch(adminRemoteDataSourceProvider)),
);
final getAdminOverviewProvider = Provider<GetAdminOverview>(
  (ref) => GetAdminOverview(ref.watch(adminRepositoryProvider)),
);
final setUserRoleProvider = Provider<SetUserRole>(
  (ref) => SetUserRole(ref.watch(adminRepositoryProvider)),
);
