// ignore_for_file: avoid_dynamic_calls
//
// dart:io Socket wrapper that satisfies the tg.SocketAbstraction interface.
// Used by MtprotoTransport on all non-web platforms (Android, iOS, macOS,
// Linux, Windows).

import 'dart:io';
import 'dart:typed_data';

import 'package:tg/tg.dart' as tg;

/// Wraps a raw [dart:io.Socket] so it can be used with the `tg` MTProto client.
class IoSocket extends tg.SocketAbstraction {
  IoSocket(this._socket);

  final Socket _socket;

  @override
  Stream<Uint8List> get receiver => _socket;

  @override
  Future<void> send(List<int> data) async {
    _socket.add(data);
    await _socket.flush();
  }

  /// Closes the underlying TCP socket.
  Future<void> close() async {
    await _socket.close();
  }
}
