import '../mtproto/mtproto_auth.dart';
import '../mtproto/mtproto_storage.dart';
import '../mtproto/mtproto_transport.dart';
import 'telegram_auth.dart';
import 'telegram_storage.dart';

/// Facade over the two Telegram surfaces TellyBase uses: authentication and
/// storage. Constructed once by the composition root and injected into the
/// feature repositories. The app layer only ever sees this facade's typed
/// [TelegramAuth] / [TelegramStorage] interfaces.
class TelegramCore {
  TelegramCore({
    required TelegramAuth auth,
    required TelegramStorage storage,
    required MtprotoTransport transport,
  })  : _auth = auth,
        _storage = storage,
        _transport = transport;

  final TelegramAuth _auth;
  final TelegramStorage _storage;
  final MtprotoTransport _transport;

  TelegramAuth get auth => _auth;
  TelegramStorage get storage => _storage;

  Future<void> disconnect() => _transport.disconnect();

  /// Whether the low-level transport is currently connected.
  bool get isConnected => _transport.isConnected;

  /// Reconnects the transport with a stored session (no-op when signed out).
  Future<void> ensureConnected() async {
    if (_transport.isConnected) return;
    final session = await _auth.restoreSession();
    await _transport.connect(session: session);
  }
}
