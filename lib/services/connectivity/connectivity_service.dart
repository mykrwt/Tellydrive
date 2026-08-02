import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';

/// Tracks network reachability and exposes a broadcast stream the backup
/// engine listens to in order to implement "automatic retry when internet
/// becomes available" without any polling.
class ConnectivityService {
  ConnectivityService() {
    _sub = Connectivity().onConnectivityChanged.listen((results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      if (online != _isOnline) {
        _isOnline = online;
        _controller.add(online);
      }
    });
    Connectivity().checkConnectivity().then((results) {
      _isOnline = results.any((r) => r != ConnectivityResult.none);
    });
  }

  late final StreamSubscription<List<ConnectivityResult>> _sub;
  final _controller = StreamController<bool>.broadcast();

  bool _isOnline = true;
  bool get isOnline => _isOnline;

  /// Emits `true` exactly at the moment connectivity is (re)gained — the
  /// backup engine subscribes to this to resume any queued/failed
  /// transfers automatically.
  Stream<bool> get onlineChanges => _controller.stream;

  void dispose() {
    _sub.cancel();
    _controller.close();
  }
}
