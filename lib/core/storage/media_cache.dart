import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../error/app_exception.dart';

/// Local on-device media cache used to render the gallery without re-downloading
/// bytes on every scroll. Cached files are keyed by the item's message id and
/// stored under `<app-docs>/cache/`.
class MediaCache {
  MediaCache._();
  static final MediaCache instance = MediaCache._();

  Directory? _root;

  Future<Directory> _dir() async {
    if (_root != null) return _root!;
    final docs = await getApplicationDocumentsDirectory();
    final cache = Directory(p.join(docs.path, 'cache'));
    await cache.create(recursive: true);
    return _root = cache;
  }

  Future<File> _fileFor(int messageId, String fileName) async {
    final dir = await _dir();
    final safeName = fileName.replaceAll(RegExp(r'[^\w.\- ]'), '_');
    return File(p.join(dir.path, '${messageId}_$safeName'));
  }

  Future<bool> exists(int messageId, String fileName) async {
    try {
      return await _fileFor(messageId, fileName).then((f) => f.existsSync());
    } on Object {
      return false;
    }
  }

  Future<String> pathFor(int messageId, String fileName) async =>
      (await _fileFor(messageId, fileName)).path;

  Future<void> put(int messageId, String fileName, File source) async {
    try {
      final target = await _fileFor(messageId, fileName);
      await target.parent.create(recursive: true);
      if (await source.exists()) {
        await source.copy(target.path);
      }
    } on Object catch (e) {
      throw LocalStorageException('Could not cache media.', cause: e);
    }
  }

  Future<void> clear() async {
    final dir = await _dir();
    try {
      for (final entity in dir.listSync()) {
        if (entity is File || entity is Directory) {
          await entity.delete(recursive: true);
        }
      }
    } on Object catch (e) {
      throw LocalStorageException('Could not clear media cache.', cause: e);
    }
  }
}
