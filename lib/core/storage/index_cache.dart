import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../features/library/domain/entities/media_item.dart';

/// On-device mirror of the library index. It exists purely so the gallery
/// renders instantly on launch; the authoritative source of truth is always
/// Telegram (rebuilt by `LibraryRepository.sync()`). Clearing or deleting this
/// file only costs a re-sync.
class IndexCache {
  IndexCache._();
  static final IndexCache instance = IndexCache._();

  Directory? _root;
  File? _file;

  Future<File> _indexFile() async {
    if (_file != null) return _file!;
    final docs = await getApplicationDocumentsDirectory();
    final dir = Directory(p.join(docs.path, 'index'));
    await dir.create(recursive: true);
    return _file = File(p.join(dir.path, 'library.json'));
  }

  Future<List<MediaItem>> read() async {
    try {
      final file = await _indexFile();
      if (!await file.exists()) return const [];
      final raw = await file.readAsString();
      final list = (jsonDecode(raw) as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .map(MediaItem.fromMetadata)
          .toList();
      return list;
    } on Object {
      return const [];
    }
  }

  Future<void> write(List<MediaItem> items) async {
    try {
      final file = await _indexFile();
      final payload = jsonEncode(
        items.map((e) => e.toMetadataJson()).toList(),
      );
      await file.writeAsString(payload, flush: true);
    } on Object {
      // index is best-effort
    }
  }
}
