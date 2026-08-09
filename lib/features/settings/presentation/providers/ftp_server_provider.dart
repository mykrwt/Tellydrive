import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../services/ftp/ftp_server.dart';
import '../../../../services/storage/secure_storage_service.dart';
import '../../../drive/presentation/providers/drive_provider.dart';

class FtpServerState {
  final bool running;
  final bool loading;
  final String host;
  final int port;
  final String username;
  final String password;
  final String? error;

  const FtpServerState({
    this.running = false,
    this.loading = false,
    this.host = '0.0.0.0',
    this.port = 2121,
    this.username = 'teledrive',
    this.password = '',
    this.error,
  });

  FtpServerState copyWith({
    bool? running,
    bool? loading,
    String? host,
    int? port,
    String? username,
    String? password,
    String? error,
    bool clearError = false,
  }) =>
      FtpServerState(
        running: running ?? this.running,
        loading: loading ?? this.loading,
        host: host ?? this.host,
        port: port ?? this.port,
        username: username ?? this.username,
        password: password ?? this.password,
        error: clearError ? null : error ?? this.error,
      );
}

class FtpServerNotifier extends StateNotifier<FtpServerState> {
  FtpServerNotifier(this._server) : super(const FtpServerState()) {
    _load();
  }

  final FtpServer _server;
  static const _usernameKey = 'ftp_username';
  static const _portKey = 'ftp_port';
  static const _passwordKey = 'ftp_password';

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final password = await SecureStorageService.instance.read(_passwordKey) ?? '';
    state = state.copyWith(
      username: prefs.getString(_usernameKey) ?? 'teledrive',
      port: prefs.getInt(_portKey) ?? 2121,
      password: password,
      host: await FtpServer.discoverHost(),
    );
  }

  Future<void> configure({
    required String username,
    required String password,
    required int port,
  }) async {
    if (state.running) throw StateError('Stop the FTP server before changing its configuration.');
    if (username.trim().isEmpty) throw ArgumentError('Username is required.');
    if (password.length < 4) throw ArgumentError('Use a password with at least 4 characters.');
    if (port < 1024 || port > 65535) throw ArgumentError('Use a port between 1024 and 65535.');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_usernameKey, username.trim());
    await prefs.setInt(_portKey, port);
    await SecureStorageService.instance.write(_passwordKey, password);
    state = state.copyWith(username: username.trim(), password: password, port: port, clearError: true);
  }

  Future<void> start() async {
    if (state.running || state.loading) return;
    if (state.password.isEmpty) {
      state = state.copyWith(error: 'Configure a password before starting the FTP server.');
      return;
    }
    state = state.copyWith(loading: true, clearError: true);
    try {
      await _server.start(port: state.port, username: state.username, password: state.password);
      state = state.copyWith(
        running: true,
        loading: false,
        port: _server.port ?? state.port,
        host: await FtpServer.discoverHost(),
      );
    } catch (error) {
      state = state.copyWith(loading: false, running: false, error: error.toString());
    }
  }

  Future<void> stop() async {
    if (!state.running && !state.loading) return;
    state = state.copyWith(loading: true, clearError: true);
    try {
      await _server.stop();
      state = state.copyWith(running: false, loading: false);
    } catch (error) {
      state = state.copyWith(loading: false, error: error.toString());
    }
  }

  @override
  void dispose() {
    _server.stop();
    super.dispose();
  }
}

final ftpServerProvider = StateNotifierProvider<FtpServerNotifier, FtpServerState>((ref) {
  final server = FtpServer(ref.read(driveRepositoryProvider));
  return FtpServerNotifier(server);
});
