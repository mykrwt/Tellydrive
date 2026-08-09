import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../features/drive/domain/entities/drive_file.dart';
import '../../features/drive/domain/entities/drive_folder.dart';
import '../../features/drive/domain/repositories/drive_repository.dart';

/// A foreground, on-demand FTP server backed directly by DriveRepository.
///
/// LIST/RETR/STOR/DELE/MKD/RMD/RNFR/RNTO all resolve through Telegram. RETR
/// lazily downloads only the requested file into TDLib's cache; no mirror of
/// the cloud library is created.
class FtpServer {
  FtpServer(this._repository);

  final DriveRepository _repository;
  ServerSocket? _server;
  final Set<Socket> _clients = {};
  final Set<_FtpSession> _sessions = {};

  bool get isRunning => _server != null;
  int? get port => _server?.port;

  Future<void> start({
    required int port,
    required String username,
    required String password,
  }) async {
    if (isRunning) return;
    if (username.trim().isEmpty || password.isEmpty) {
      throw ArgumentError('FTP username and password are required.');
    }
    final socket = await ServerSocket.bind(InternetAddress.anyIPv4, port, shared: true);
    _server = socket;
    socket.listen((client) {
      _clients.add(client);
      final session = _FtpSession(
        socket: client,
        repository: _repository,
        username: username,
        password: password,
        onClosed: () => _clients.remove(client),
      );
      _sessions.add(session);
      session.run().whenComplete(() {
        _sessions.remove(session);
        _clients.remove(client);
      });
    }, onError: (_) => stop());
  }

  Future<void> stop() async {
    final server = _server;
    _server = null;
    for (final session in _sessions.toList()) {
      await session.close();
    }
    for (final client in _clients.toList()) {
      await client.close();
    }
    _sessions.clear();
    _clients.clear();
    await server?.close();
  }

  static Future<String> discoverHost() async {
    try {
      final interfaces = await NetworkInterface.list(type: InternetAddressType.IPv4, includeLoopback: false);
      final addresses = interfaces.expand((item) => item.addresses).where((address) => !address.isLoopback).toList();
      for (final address in addresses) {
        if (address.address.startsWith('192.168.') ||
            address.address.startsWith('10.') ||
            RegExp(r'^172\.(1[6-9]|2\d|3[01])\.').hasMatch(address.address)) {
          return address.address;
        }
      }
      if (addresses.isNotEmpty) return addresses.first.address;
    } catch (_) {}
    return '0.0.0.0';
  }
}

class _FtpSession {
  _FtpSession({
    required this.socket,
    required this.repository,
    required this.username,
    required this.password,
    required this.onClosed,
  });

  final Socket socket;
  final DriveRepository repository;
  final String username;
  final String password;
  final VoidCallback onClosed;

  bool _authenticated = false;
  bool _userAccepted = false;
  String? _folderId;
  ServerSocket? _passive;
  int _restartOffset = 0;
  Object? _renameSource;
  bool _closed = false;

  void _reply(int code, String message) => socket.writeln('$code $message');

  Future<void> run() async {
    _reply(220, 'TeleDrive Telegram-backed FTP ready');
    try {
      await for (final line in socket
          .cast<List<int>>()
          .transform(utf8.decoder)
          .transform(const LineSplitter())) {
        if (_closed) break;
        final trimmed = line.trim();
        if (trimmed.isEmpty) continue;
        final separator = trimmed.indexOf(' ');
        final command = (separator < 0 ? trimmed : trimmed.substring(0, separator)).toUpperCase();
        final argument = separator < 0 ? '' : trimmed.substring(separator + 1).trim();
        if (command != 'USER' && command != 'PASS' && command != 'QUIT' && !_authenticated) {
          _reply(530, 'Please log in with USER and PASS');
          continue;
        }
        try {
          await _command(command, argument);
        } catch (error) {
          _reply(550, _cleanError(error));
        }
      }
    } catch (_) {
      // Client disconnected.
    } finally {
      await close();
      onClosed();
    }
  }

  String _cleanError(Object error) => error.toString().replaceFirst(RegExp(r'^(Exception|StateError|ArgumentError):\s*'), '').replaceAll(RegExp(r'[\r\n]+'), ' ');

  Future<void> _command(String command, String argument) async {
    switch (command) {
      case 'USER':
        _userAccepted = argument == username;
        _reply(_userAccepted ? 331 : 530, _userAccepted ? 'Password required' : 'Invalid username');
        return;
      case 'PASS':
        _authenticated = _userAccepted && argument == password;
        _reply(_authenticated ? 230 : 530, _authenticated ? 'Logged in' : 'Authentication failed');
        return;
      case 'QUIT':
        _reply(221, 'Goodbye');
        await close();
        return;
      case 'NOOP':
        _reply(200, 'OK');
        return;
      case 'SYST':
        _reply(215, 'UNIX Type: L8');
        return;
      case 'FEAT':
        socket.write('211-Features\r\n UTF8\r\n EPSV\r\n PASV\r\n REST STREAM\r\n SIZE\r\n MDTM\r\n211 End\r\n');
        return;
      case 'OPTS':
        _reply(200, argument.toUpperCase() == 'UTF8 ON' ? 'UTF8 enabled' : 'Option accepted');
        return;
      case 'TYPE':
      case 'MODE':
      case 'STRU':
        _reply(200, 'Command accepted');
        return;
      case 'PWD':
      case 'XPWD':
        final folders = await repository.getFolders();
        final folder = _folderById(folders, _folderId);
        _reply(257, '"${folder == null ? '/' : '/${_ftpName(folder.title)}'}"');
        return;
      case 'CWD':
      case 'XCWD':
        await _changeDirectory(argument);
        return;
      case 'CDUP':
        _folderId = null;
        _reply(250, 'Directory changed to /');
        return;
      case 'PASV':
        await _enterPassive(extended: false);
        return;
      case 'EPSV':
        await _enterPassive(extended: true);
        return;
      case 'LIST':
      case 'MLSD':
      case 'NLST':
        await _list(namesOnly: command == 'NLST', machine: command == 'MLSD');
        return;
      case 'RETR':
        await _retrieve(argument);
        return;
      case 'STOR':
        await _store(argument, append: false);
        return;
      case 'APPE':
        await _store(argument, append: true);
        return;
      case 'DELE':
        final file = await _findFile(argument);
        await repository.deleteFile(file);
        _reply(250, 'Deleted from Telegram storage');
        return;
      case 'MKD':
      case 'XMKD':
        final folder = await repository.createFolder(_basename(argument));
        _reply(257, '"/${_ftpName(folder.title)}" created');
        return;
      case 'RMD':
      case 'XRMD':
        final folder = await _findFolder(argument);
        await repository.deleteFolder(folder);
        if (_folderId == folder.id) _folderId = null;
        _reply(250, 'Telegram folder removed');
        return;
      case 'RNFR':
        _renameSource = _folderId == null
            ? await _findFolder(argument)
            : await _findFile(argument);
        _reply(350, 'Send RNTO');
        return;
      case 'RNTO':
        await _rename(argument);
        return;
      case 'SIZE':
        final file = await _findFile(argument);
        _reply(213, file.size.toString());
        return;
      case 'MDTM':
        final file = await _findFile(argument);
        _reply(213, _ftpTimestamp(file.uploadedAt));
        return;
      case 'REST':
        _restartOffset = int.tryParse(argument) ?? 0;
        _reply(350, 'Restart position accepted');
        return;
      case 'ABOR':
        await _closePassive();
        _reply(226, 'Transfer aborted');
        return;
      default:
        _reply(502, 'Command not implemented');
    }
  }

  Future<void> _changeDirectory(String value) async {
    final path = value.trim();
    if (path.isEmpty || path == '/' || path == '..') {
      _folderId = null;
      _reply(250, 'Directory changed to /');
      return;
    }
    final folder = await _findFolder(path);
    _folderId = folder.id;
    _reply(250, 'Directory changed');
  }

  Future<void> _enterPassive({required bool extended}) async {
    await _closePassive();
    _passive = await ServerSocket.bind(InternetAddress.anyIPv4, 0);
    if (extended) {
      _reply(229, 'Entering Extended Passive Mode (|||${_passive!.port}|)');
      return;
    }
    var host = socket.address.address;
    if (host == '0.0.0.0' || host == '127.0.0.1') host = await FtpServer.discoverHost();
    final parts = host.split('.');
    if (parts.length != 4) {
      _reply(425, 'Use EPSV');
      await _closePassive();
      return;
    }
    final p1 = _passive!.port ~/ 256;
    final p2 = _passive!.port % 256;
    _reply(227, 'Entering Passive Mode (${parts.join(',')},$p1,$p2)');
  }

  Future<void> _withData(Future<void> Function(Socket data) transfer) async {
    final passive = _passive;
    if (passive == null) {
      _reply(425, 'Use PASV or EPSV first');
      return;
    }
    _reply(150, 'Opening data connection');
    try {
      final data = await passive.first.timeout(const Duration(seconds: 30));
      try {
        await transfer(data);
        await data.flush();
      } finally {
        await data.close();
      }
      _reply(226, 'Transfer complete');
    } finally {
      await _closePassive();
    }
  }

  Future<void> _list({required bool namesOnly, required bool machine}) async {
    final folders = await repository.getFolders();
    await _withData((data) async {
      if (_folderId == null) {
        for (final folder in folders) {
          final name = _ftpName(folder.title);
          if (namesOnly) {
            data.writeln(name);
          } else if (machine) {
            data.writeln('type=dir;modify=${_ftpTimestamp(folder.createdAt)}; $name');
          } else {
            data.writeln('drwxr-xr-x 1 telegram telegram 0 ${_listDate(folder.createdAt)} $name');
          }
        }
      } else {
        final files = await repository.getFiles(folderId: _folderId);
        for (final file in files) {
          final name = _ftpName(file.name);
          if (namesOnly) {
            data.writeln(name);
          } else if (machine) {
            data.writeln('type=file;size=${file.size};modify=${_ftpTimestamp(file.uploadedAt)}; $name');
          } else {
            data.writeln('-rw-r--r-- 1 telegram telegram ${file.size} ${_listDate(file.uploadedAt)} $name');
          }
        }
      }
    });
  }

  Future<void> _retrieve(String name) async {
    final file = await _findFile(name);
    final path = await repository.downloadFile(file: file);
    final source = File(path);
    final offset = _restartOffset.clamp(0, await source.length()) as int;
    _restartOffset = 0;
    await _withData((data) => data.addStream(source.openRead(offset)));
  }

  Future<void> _store(String name, {required bool append}) async {
    if (_folderId == null) throw StateError('Choose a Telegram folder before uploading.');
    final fileName = _basename(name);
    if (fileName.isEmpty) throw ArgumentError('A file name is required.');
    final temporary = await getTemporaryDirectory();
    final uploadDirectory = Directory(p.join(
      temporary.path,
      'teledrive_ftp',
      DateTime.now().microsecondsSinceEpoch.toString(),
    ));
    await uploadDirectory.create(recursive: true);
    final upload = File(p.join(uploadDirectory.path, _localName(fileName)));
    DriveFile? replacedFile;
    if (append) {
      try {
        replacedFile = await _findFile(fileName);
        final existing = await repository.downloadFile(file: replacedFile);
        await File(existing).copy(upload.path);
      } catch (_) {
        replacedFile = null;
      }
    }
    try {
      await _withData((data) async {
        final sink = upload.openWrite(mode: append ? FileMode.append : FileMode.writeOnly);
        try {
          await sink.addStream(data);
        } finally {
          await sink.close();
        }
        // Do not report 226 until Telegram has accepted the whole upload.
        await repository.uploadFile(
          localPath: upload.path,
          fileName: fileName,
          folderId: _folderId!,
        );
        final oldFile = replacedFile;
        if (oldFile != null) {
          await repository.deleteFile(oldFile);
        }
      });
    } finally {
      if (await uploadDirectory.exists()) {
        await uploadDirectory.delete(recursive: true);
      }
    }
  }

  Future<void> _rename(String value) async {
    final source = _renameSource;
    _renameSource = null;
    if (source == null) {
      _reply(503, 'RNFR required first');
      return;
    }
    final name = _basename(value);
    if (source is DriveFile) {
      await repository.renameFile(source, name);
    } else if (source is DriveFolder) {
      await repository.renameFolder(source, name);
    }
    _reply(250, 'Renamed in Telegram storage');
  }

  Future<DriveFile> _findFile(String value) async {
    if (_folderId == null) throw StateError('Not inside a Telegram folder.');
    final name = _basename(value);
    final files = await repository.getFiles(folderId: _folderId);
    for (final file in files) {
      if (_ftpName(file.name) == name || file.name == name) return file;
    }
    throw StateError('File not found.');
  }

  Future<DriveFolder> _findFolder(String value) async {
    final name = _basename(value);
    final folders = await repository.getFolders();
    for (final folder in folders) {
      if (_ftpName(folder.title) == name || folder.title == name) return folder;
    }
    throw StateError('Folder not found.');
  }

  DriveFolder? _folderById(List<DriveFolder> folders, String? id) {
    if (id == null) return null;
    for (final folder in folders) {
      if (folder.id == id) return folder;
    }
    return null;
  }

  String _basename(String value) {
    final normalized = value.replaceAll('\\', '/').replaceAll(RegExp(r'^/+|/+$'), '');
    return normalized.contains('/') ? normalized.split('/').last : normalized;
  }

  String _ftpName(String value) => value.replaceAll('/', '_').replaceAll('\r', ' ').replaceAll('\n', ' ');
  String _localName(String value) => value.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
  String _ftpTimestamp(DateTime value) => '${value.toUtc().year.toString().padLeft(4, '0')}${value.toUtc().month.toString().padLeft(2, '0')}${value.toUtc().day.toString().padLeft(2, '0')}${value.toUtc().hour.toString().padLeft(2, '0')}${value.toUtc().minute.toString().padLeft(2, '0')}${value.toUtc().second.toString().padLeft(2, '0')}';
  String _listDate(DateTime value) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[value.month - 1]} ${value.day.toString().padLeft(2, ' ')} ${value.year}';
  }

  Future<void> _closePassive() async {
    final passive = _passive;
    _passive = null;
    await passive?.close();
  }

  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    await _closePassive();
    await socket.close();
  }
}

typedef VoidCallback = void Function();
