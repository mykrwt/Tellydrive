import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:t/t.dart' as t;
import 'package:tg/tg.dart' as tg;

import '../../core/config/telegram_config.dart';

/// Bridges Dart's [Socket] to the transport interface `tg` expects. This
/// is the only "wiring" the pure-Dart MTProto stack needs from the host
/// platform — everything else (encryption, framing, auth-key exchange,
/// TL serialization) is handled by the `t`/`tg` packages themselves.
class _IoSocket extends tg.SocketAbstraction {
  _IoSocket(this._socket);
  final Socket _socket;

  @override
  Stream<Uint8List> get receiver => _socket;

  @override
  Future<void> send(List<int> data) async {
    _socket.add(data);
    await _socket.flush();
  }
}

/// Owns the raw MTProto transport connection to a single Telegram data
/// center: TCP socket + transport obfuscation + the Diffie-Hellman
/// authorization-key exchange + the resulting [tg.Client] used for every
/// subsequent RPC call. Session (the authorization key) is persisted to
/// disk so re-opening the app doesn't require logging in again — exactly
/// like every official Telegram client.
///
/// This class deliberately contains zero TellyBase-specific logic; it is
/// a thin, reusable "how do I even talk MTProto to Telegram" layer that
/// [TelegramAuthService] and [TelegramVaultService] build on top of.
class MtprotoConnection {
  MtprotoConnection({required this.sessionFilePath});

  final String sessionFilePath;

  tg.Client? _client;
  t.DcOption _dc = const t.DcOption(
    ipv6: false,
    mediaOnly: false,
    tcpoOnly: false,
    cdn: false,
    static: false,
    thisPortOnly: false,
    id: TelegramConfig.defaultDcId,
    ipAddress: TelegramConfig.defaultDcIp,
    port: TelegramConfig.defaultDcPort,
  );

  final List<t.DcOption> knownDcs = [];

  tg.Client get client {
    final c = _client;
    if (c == null) throw StateError('Not connected yet. Call connect() first.');
    return c;
  }

  bool get isConnected => _client != null;

  /// Switches the active data center (used for `PHONE_MIGRATE_x` /
  /// `NETWORK_MIGRATE_x` redirects Telegram issues when an account's home
  /// DC differs from the one we happened to connect to first) and forces
  /// the next [connect] call to establish a fresh session there.
  Future<void> switchDataCenter(int dcId) async {
    final target = knownDcs.firstWhere(
      (d) => d.id == dcId && !d.ipv6,
      orElse: () => t.DcOption(
        ipv6: false,
        mediaOnly: false,
        tcpoOnly: false,
        cdn: false,
        static: false,
        thisPortOnly: false,
        id: dcId,
        ipAddress: _wellKnownDcIp(dcId),
        port: 443,
      ),
    );
    _dc = target;
    _client = null;
    final file = File(sessionFilePath);
    if (await file.exists()) {
      await file.delete();
    }
  }

  static String _wellKnownDcIp(int dcId) => switch (dcId) {
        1 => '149.154.175.53',
        2 => '149.154.167.51',
        3 => '149.154.175.100',
        4 => '149.154.167.91',
        5 => '91.108.56.130',
        _ => TelegramConfig.defaultDcIp,
      };

  Future<tg.Client> connect() async {
    final existing = _client;
    if (existing != null) return existing;

    final socket = await Socket.connect(_dc.ipAddress, _dc.port);
    final ioSocket = _IoSocket(socket);

    final obfuscation = tg.Obfuscation.random(false, _dc.id);
    final idGenerator = tg.MessageIdGenerator();
    await ioSocket.send(obfuscation.preamble);

    final savedKey = await _loadSession();
    final authKey = savedKey ?? await tg.Client.authorize(ioSocket, obfuscation, idGenerator);
    if (savedKey == null) {
      await _saveSession(authKey);
    }

    final client = tg.Client(
      socket: ioSocket,
      obfuscation: obfuscation,
      authorizationKey: authKey,
      idGenerator: idGenerator,
    );

    final cfg = await client.initConnection<t.Config>(
      apiId: TelegramConfig.apiId,
      deviceModel: Platform.isAndroid || Platform.isIOS
          ? Platform.operatingSystem
          : TelegramConfig.deviceModelFallback,
      systemVersion: Platform.operatingSystemVersion,
      appVersion: TelegramConfig.appVersion,
      systemLangCode: TelegramConfig.systemLangCode,
      langPack: TelegramConfig.langPack,
      langCode: TelegramConfig.langCode,
      query: const t.HelpGetConfig(),
    );

    final config = cfg.result;
    if (config != null) {
      knownDcs
        ..clear()
        ..addAll(config.dcOptions.whereType<t.DcOption>());
    }

    _client = client;
    return client;
  }

  Future<tg.AuthorizationKey?> _loadSession() async {
    final file = File(sessionFilePath);
    if (!await file.exists()) return null;
    try {
      final json = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      return tg.AuthorizationKey.fromJson(json);
    } catch (_) {
      return null;
    }
  }

  Future<void> _saveSession(tg.AuthorizationKey key) async {
    final file = File(sessionFilePath);
    await file.writeAsString(jsonEncode(key.toJson()));
  }

  Future<void> clearSession() async {
    _client = null;
    final file = File(sessionFilePath);
    if (await file.exists()) await file.delete();
  }
}
