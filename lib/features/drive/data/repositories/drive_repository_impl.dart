import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:mime/mime.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../../domain/entities/drive_file.dart';
import '../../domain/entities/drive_folder.dart';
import '../../domain/repositories/drive_repository.dart';
import '../../../../core/constants/app_constants.dart';
import '../../../../services/platform/native_telegram_channel.dart';
import '../../../../services/transfers/chunk_metadata.dart';

/// Telegram/TDLib implementation retained from the upstream TeleDrive project.
/// Large-file composition is layered above TDLib rather than replacing it.
class DriveRepositoryImpl implements DriveRepository {
  static const String savedMessagesId = 'saved_messages';
  static const String _chunkPrefix = '.teledrive-chunk-';
  static const String _manifestPrefix = '.teledrive-manifest-';

  int? _myUserId;

  String _extension(String fileName) {
    final name = p.basename(fileName.split('?').first.split('#').first);
    final dot = name.lastIndexOf('.');
    return dot < 0 || dot == name.length - 1
        ? ''
        : name.substring(dot + 1).toLowerCase();
  }

  DriveFileType _resolveType(Map<String, dynamic> map) {
    final raw = (map['type'] ?? '').toString().toLowerCase();
    final mimeType = (map['mimeType'] ?? '').toString().toLowerCase();
    final name = (map['fileName'] ?? map['name'] ?? '').toString();
    final ext = _extension(name);
    const images = {
      'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'svg'
    };
    const videos = {
      'mp4', 'mkv', 'mov', 'webm', 'avi', 'flv', 'wmv', 'm4v', '3gp'
    };
    const audio = {'mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac', 'opus', 'wma'};
    const archives = {'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'};
    const documents = {
      'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'rtf', 'odt',
      'ods', 'odp', 'pages', 'numbers', 'key', 'csv', 'md'
    };
    if (images.contains(ext) || mimeType.startsWith('image/') || raw == 'photo') {
      return DriveFileType.image;
    }
    if (videos.contains(ext) || mimeType.startsWith('video/')) {
      return DriveFileType.video;
    }
    if (audio.contains(ext) || mimeType.startsWith('audio/')) {
      return DriveFileType.audio;
    }
    if (ext == 'pdf' || mimeType == 'application/pdf') return DriveFileType.pdf;
    if (archives.contains(ext) || raw == 'archive') return DriveFileType.archive;
    if (documents.contains(ext)) return DriveFileType.document;
    return DriveFileType.other;
  }

  Future<int> _getMyUserId() async {
    if (_myUserId != null) return _myUserId!;
    final me = await NativeTelegramChannel.getMe();
    _myUserId = (me['id'] as num).toInt();
    return _myUserId!;
  }

  Future<int> _chatIdFor(String folderId) async {
    if (folderId == savedMessagesId) return _getMyUserId();
    return int.tryParse(folderId) ?? 0;
  }

  @override
  Future<List<DriveFolder>> getFolders() async {
    final me = await NativeTelegramChannel.getMe();
    final myId = (me['id'] as num).toInt();
    _myUserId = myId;
    final chats = await NativeTelegramChannel.getMyChats(limit: 100);
    final folders = <DriveFolder>[
      DriveFolder(
        id: savedMessagesId,
        title: 'Saved Messages',
        telegramChannelId: myId.toString(),
        createdAt: DateTime.now(),
        fileCount: 0,
        isSavedMessages: true,
      ),
    ];
    final seen = <String>{myId.toString(), savedMessagesId};
    for (final chat in chats) {
      final id = (chat['id'] as num).toInt().toString();
      if (seen.add(id)) {
        folders.add(DriveFolder(
          id: id,
          title: chat['title']?.toString() ?? 'Untitled',
          telegramChannelId: id,
          createdAt: DateTime.now(),
          fileCount: 0,
        ));
      }
    }

    // Keep support for channels linked by older TeleDrive releases.
    final prefs = await SharedPreferences.getInstance();
    for (final entry in prefs.getStringList('imported_folders') ?? const []) {
      final separator = entry.indexOf(':');
      if (separator <= 0) continue;
      final id = entry.substring(0, separator);
      if (!seen.add(id)) continue;
      folders.add(DriveFolder(
        id: id,
        title: entry.substring(separator + 1),
        telegramChannelId: id,
        createdAt: DateTime.now(),
        fileCount: 0,
      ));
    }
    return folders;
  }

  DateTime _dateOf(Map<String, dynamic> map) {
    final seconds = (map['date'] as num?)?.toInt() ?? 0;
    return seconds > 0
        ? DateTime.fromMillisecondsSinceEpoch(seconds * 1000)
        : DateTime.now();
  }

  DriveFile _normalFile(Map<String, dynamic> map, String folderId) {
    final name = (map['fileName'] ?? map['name'] ?? 'Unknown File').toString();
    final local = (map['localPath'] ?? '').toString();
    final thumb = (map['thumbnailPath'] ?? '').toString();
    final messageId = map['messageId']?.toString() ?? '0';
    return DriveFile(
      id: map['fileId']?.toString() ?? '0',
      telegramMessageId: messageId,
      telegramMessageIds: [messageId],
      folderId: folderId,
      name: name,
      type: _resolveType({...map, 'fileName': name}),
      size: (map['size'] as num?)?.toInt() ?? 0,
      uploadedAt: _dateOf(map),
      localPath: local.isEmpty ? null : local,
      thumbnailUrl: thumb.isEmpty ? null : thumb,
      thumbnailFileId: map['thumbnailFileId']?.toString(),
      mimeType: map['mimeType']?.toString(),
      isDownloaded: map['isDownloadingCompleted'] == true,
    );
  }

  @override
  Future<List<DriveFile>> getFiles({String? folderId}) async {
    final resolvedFolder = folderId ?? savedMessagesId;
    final chatId = await _chatIdFor(resolvedFolder);
    if (chatId == 0) return [];
    final raw = await NativeTelegramChannel.getDriveFiles(
      chatId: chatId,
      limit: AppConstants.telegramHistoryScanLimit,
    );

    final chunks = <String, List<Map<String, dynamic>>>{};
    final manifests = <String, List<MapEntry<ChunkMetadata, Map<String, dynamic>>>>{};
    final visible = <DriveFile>[];

    for (final map in raw) {
      final metadata = ChunkMetadata.tryParseCaption(map['caption']);
      final fileName = map['fileName']?.toString() ?? '';
      if (metadata?.isChunk == true) {
        chunks.putIfAbsent(metadata!.uploadId, () => []).add(map);
      } else if (metadata?.isManifest == true) {
        manifests
            .putIfAbsent(metadata!.uploadId, () => [])
            .add(MapEntry(metadata!, map));
      } else if (fileName.startsWith(_chunkPrefix) ||
          fileName.startsWith(_manifestPrefix) ||
          fileName.endsWith('.tdpart') ||
          fileName.endsWith('.tdmanifest')) {
        // Internal artifacts are intentionally never user-facing.
        continue;
      } else {
        visible.add(_normalFile(map, resolvedFolder));
      }
    }

    for (final manifestCopies in manifests.values) {
      // History is newest-first, so the first manifest is the committed item.
      final entry = manifestCopies.first;
      final metadata = entry.key;
      final manifest = entry.value;
      final rawParts = chunks[metadata.uploadId] ?? const [];
      final partsByIndex = <int, DriveChunk>{};
      for (final part in rawParts) {
        final partMeta = ChunkMetadata.tryParseCaption(part['caption']);
        if (partMeta == null || partMeta.chunkIndex == null) continue;
        // History is newest-first. If a failed retry left an orphan document,
        // use the newest part for that order and keep every artifact hidden.
        partsByIndex.putIfAbsent(
          partMeta.chunkIndex!,
          () => DriveChunk(
            index: partMeta.chunkIndex!,
            telegramFileId: part['fileId']?.toString() ?? '0',
            telegramMessageId: part['messageId']?.toString() ?? '0',
            size: (part['size'] as num?)?.toInt() ?? 0,
          ),
        );
      }
      final parts = partsByIndex.values.toList()
        ..sort((a, b) => a.index.compareTo(b.index));
      final manifestMessage = manifest['messageId']?.toString() ?? '0';
      final allMessages = <String>[
        ...manifestCopies.map(
          (copy) => copy.value['messageId']?.toString() ?? '0',
        ),
        ...rawParts.map((part) => part['messageId']?.toString() ?? '0'),
      ];
      visible.add(DriveFile(
        id: 'chunked:${metadata.uploadId}',
        telegramMessageId: manifestMessage,
        telegramMessageIds: allMessages,
        folderId: resolvedFolder,
        name: metadata.originalName,
        type: _resolveType({
          'fileName': metadata.originalName,
          'mimeType': metadata.mimeType,
        }),
        size: metadata.originalSize,
        uploadedAt: _dateOf(manifest),
        mimeType: metadata.mimeType,
        chunkUploadId: metadata.uploadId,
        chunks: parts,
      ));
    }
    return visible;
  }

  Future<String> _downloadTelegramFile(
    int fileId, {
    void Function(double progress)? onProgress,
  }) async {
    final completer = Completer<String>();
    late StreamSubscription<Map<String, dynamic>> subscription;
    subscription = NativeTelegramChannel.fileUpdateStream.listen((event) {
      if ((event['fileId'] as num?)?.toInt() != fileId) return;
      final size = (event['size'] as num?)?.toInt() ?? 0;
      final downloaded = (event['downloadedPrefixSize'] as num?)?.toInt() ?? 0;
      if (size > 0) onProgress?.call((downloaded / size).clamp(0.0, 1.0).toDouble());
      final path = (event['localPath'] ?? '').toString();
      if ((event['isDownloadingCompleted'] == true || (size > 0 && downloaded >= size)) &&
          path.isNotEmpty &&
          File(path).existsSync()) {
        if (!completer.isCompleted) completer.complete(path);
      }
    }, onError: (Object error) {
      if (!completer.isCompleted) completer.completeError(error);
    });
    try {
      final initial = await NativeTelegramChannel.downloadFile(
        fileId: fileId,
        priority: 32,
      );
      final size = (initial['size'] as num?)?.toInt() ?? 0;
      final downloaded = (initial['downloadedPrefixSize'] as num?)?.toInt() ?? 0;
      final path = (initial['localPath'] ?? '').toString();
      if ((initial['isDownloadingCompleted'] == true || (size > 0 && downloaded >= size)) &&
          path.isNotEmpty &&
          File(path).existsSync()) {
        if (!completer.isCompleted) completer.complete(path);
      }
      return await completer.future.timeout(
        const Duration(hours: 2),
        onTimeout: () => throw TimeoutException('Telegram download timed out'),
      );
    } finally {
      await subscription.cancel();
    }
  }

  @override
  Future<String> downloadFile({
    required DriveFile file,
    void Function(double progress)? onProgress,
  }) async {
    if (!file.isChunked) {
      return _downloadTelegramFile(int.parse(file.id), onProgress: onProgress);
    }
    final hasMissingPart = file.chunks.isEmpty ||
        file.chunks.asMap().entries.any((entry) => entry.key != entry.value.index);
    if (hasMissingPart) {
      throw StateError(
        'This upload is incomplete. Re-select the original file to resume it.',
      );
    }
    final support = await getApplicationSupportDirectory();
    final directory = Directory(p.join(
      support.path,
      'reconstructed',
      file.chunkUploadId!,
    ));
    await directory.create(recursive: true);
    final output = File(p.join(directory.path, _safeFileName(file.name)));
    if (await output.exists() && await output.length() == file.size) {
      onProgress?.call(1);
      return output.path;
    }
    final sink = output.openWrite(mode: FileMode.writeOnly);
    var completedBytes = 0;
    try {
      for (final chunk in file.chunks) {
        final path = await _downloadTelegramFile(
          int.parse(chunk.telegramFileId),
          onProgress: (partProgress) {
            final current = completedBytes + (chunk.size * partProgress);
            if (file.size > 0) onProgress?.call((current / file.size).clamp(0.0, 1.0).toDouble());
          },
        );
        await sink.addStream(File(path).openRead());
        completedBytes += chunk.size;
        if (file.size > 0) {
          onProgress?.call((completedBytes / file.size).clamp(0.0, 1.0).toDouble());
        }
      }
    } catch (_) {
      await sink.close();
      if (await output.exists()) await output.delete();
      rethrow;
    }
    await sink.close();
    final actualSize = await output.length();
    if (actualSize != file.size) {
      await output.delete();
      throw StateError('Reconstructed file size does not match its manifest.');
    }
    onProgress?.call(1);
    return output.path;
  }

  @override
  Future<String?> downloadThumbnail(DriveFile file) async {
    final existing = file.thumbnailUrl;
    if (existing != null && existing.isNotEmpty && await File(existing).exists()) {
      return existing;
    }
    final id = int.tryParse(file.thumbnailFileId ?? '');
    if (id == null) return file.localPath;
    return _downloadTelegramFile(id);
  }

  String _safeFileName(String name) => name.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');

  Future<File> _writeChunk(
      RandomAccessFile input, Directory directory, String uploadId,
      int index, int count, int bytes) async {
    final part = File(p.join(
      directory.path,
      '$_chunkPrefix$uploadId-${(index + 1).toString().padLeft(5, '0')}-of-${count.toString().padLeft(5, '0')}.tdpart',
    ));
    final sink = part.openWrite(mode: FileMode.writeOnly);
    var remaining = bytes;
    try {
      try {
        while (remaining > 0) {
          final data = await input.read(math.min(1024 * 1024, remaining));
          if (data.isEmpty) {
            throw const FileSystemException('Unexpected end of file');
          }
          sink.add(data);
          await sink.flush();
          remaining -= data.length;
        }
      } finally {
        await sink.close();
      }
      return part;
    } catch (_) {
      if (await part.exists()) await part.delete();
      rethrow;
    }
  }

  bool _isUploadDone(Map<String, dynamic> map) {
    if (map['isUploadingCompleted'] == true) return true;
    final size = (map['size'] as num?)?.toInt() ?? 0;
    final sent = (map['uploadedSize'] as num?)?.toInt() ?? 0;
    if (size > 0 && sent >= size) return true;
    if (map['isUploadingActive'] == false && sent > 0 && sent == size) {
      return true;
    }
    return false;
  }

  Future<Map<String, dynamic>> _uploadTelegramDocument({
    required int chatId,
    required String path,
    String? caption,
    void Function(double progress)? onProgress,
  }) async {
    int? uploadedFileId;
    final pendingEvents = <int, Map<String, dynamic>>{};
    final complete = Completer<void>();
    late StreamSubscription<Map<String, dynamic>> subscription;
    void consume(Map<String, dynamic> event) {
      final id = (event['fileId'] as num?)?.toInt();
      if (id == null) return;
      if (uploadedFileId == null) {
        pendingEvents[id] = event;
        return;
      }
      if (id != uploadedFileId) return;
      final size = (event['size'] as num?)?.toInt() ?? 0;
      final sent = (event['uploadedSize'] as num?)?.toInt() ?? 0;
      if (size > 0) onProgress?.call((sent / size).clamp(0.0, 1.0).toDouble());
      if (_isUploadDone(event) && !complete.isCompleted) {
        complete.complete();
      }
    }

    subscription = NativeTelegramChannel.fileUpdateStream.listen(consume);
    try {
      final result = await NativeTelegramChannel.uploadFile(
        chatId: chatId,
        filePath: path,
        caption: caption,
      );
      uploadedFileId = (result['fileId'] as num?)?.toInt();
      if (uploadedFileId == null || uploadedFileId == 0) {
        throw StateError('Telegram did not return an uploaded file ID.');
      }
      final buffered = pendingEvents[uploadedFileId];
      if (buffered != null) consume(buffered);
      if (_isUploadDone(result) && !complete.isCompleted) {
        complete.complete();
      }
      await complete.future.timeout(
        const Duration(hours: 2),
        onTimeout: () => throw TimeoutException('Telegram upload timed out'),
      );
      onProgress?.call(1);
      return result;
    } finally {
      await subscription.cancel();
    }
  }

  String _resumeKey(String localPath, String fileName, int size, int modified) {
    final identity = base64Url.encode(utf8.encode('$localPath\u0000$fileName\u0000$size\u0000$modified'));
    return 'chunk_resume_$identity';
  }

  @override
  Future<DriveFile> uploadFile({
    required String localPath,
    required String fileName,
    required String folderId,
    void Function(double progress)? onProgress,
  }) async {
    final chatId = await _chatIdFor(folderId);
    if (chatId == 0) throw ArgumentError('Invalid Telegram folder.');
    if (localPath.startsWith('content://')) {
      // Materializing one selected file is necessary to provide random access
      // for chunking; this is not a mirror of the Telegram library.
      final materialized = await NativeTelegramChannel.materializeFile(localPath);
      return uploadFile(
        localPath: materialized,
        fileName: fileName,
        folderId: folderId,
        onProgress: onProgress,
      );
    }
    final source = File(localPath);
    if (!await source.exists()) throw FileSystemException('File not found', localPath);
    final size = await source.length();
    if (size <= AppConstants.telegramDirectUploadBytes) {
      Directory? stagingDirectory;
      var uploadPath = localPath;
      final expectedName = _safeFileName(fileName);
      if (p.basename(localPath) != expectedName) {
        final temporary = await getTemporaryDirectory();
        stagingDirectory = Directory(p.join(
          temporary.path,
          'teledrive_upload_names',
          DateTime.now().microsecondsSinceEpoch.toString(),
        ));
        await stagingDirectory.create(recursive: true);
        uploadPath = p.join(stagingDirectory.path, expectedName);
        await source.copy(uploadPath);
      }
      try {
        final result = await _uploadTelegramDocument(
          chatId: chatId,
          path: uploadPath,
          onProgress: onProgress,
        );
        return _uploadedNormal(result, localPath, fileName, folderId, size: size);
      } finally {
        if (stagingDirectory != null && await stagingDirectory.exists()) {
          await stagingDirectory.delete(recursive: true);
        }
      }
    }
    return _uploadChunked(
      source: source,
      originalName: fileName,
      originalSize: size,
      folderId: folderId,
      chatId: chatId,
      onProgress: onProgress,
    );
  }

  DriveFile _uploadedNormal(Map<String, dynamic> result, String localPath,
      String fileName, String folderId,
      {int? size}) {
    final messageId = result['messageId']?.toString() ?? '0';
    final mimeType = lookupMimeType(fileName) ?? 'application/octet-stream';
    return DriveFile(
      id: result['fileId']?.toString() ?? '0',
      telegramMessageId: messageId,
      telegramMessageIds: [messageId],
      folderId: folderId,
      name: fileName,
      type: _resolveType({'fileName': fileName, 'mimeType': mimeType}),
      size: size ?? (result['size'] as num?)?.toInt() ?? 0,
      uploadedAt: DateTime.now(),
      localPath: localPath,
      mimeType: mimeType,
      isDownloaded: true,
    );
  }

  Future<DriveFile> _uploadChunked({
    required File source,
    required String originalName,
    required int originalSize,
    required String folderId,
    required int chatId,
    void Function(double progress)? onProgress,
  }) async {
    final modified = (await source.lastModified()).millisecondsSinceEpoch;
    final key = _resumeKey(source.path, originalName, originalSize, modified);
    final prefs = await SharedPreferences.getInstance();
    Map<String, dynamic> resume = {};
    final saved = prefs.getString(key);
    if (saved != null) {
      try {
        resume = Map<String, dynamic>.from(jsonDecode(saved) as Map);
      } catch (_) {
        resume = {};
      }
    }
    final uploadId = resume['uploadId']?.toString() ?? const Uuid().v4();
    final chunkSize = AppConstants.telegramChunkSizeBytes;
    final chunkCount = (originalSize / chunkSize).ceil();
    final mimeType = lookupMimeType(originalName) ?? 'application/octet-stream';
    final completed = <int, Map<String, dynamic>>{};
    for (final value in (resume['completed'] as List? ?? const [])) {
      if (value is! Map) continue;
      final map = Map<String, dynamic>.from(value);
      final index = (map['index'] as num?)?.toInt();
      if (index != null) completed[index] = map;
    }
    final tempRoot = await getTemporaryDirectory();
    final temp = Directory(p.join(tempRoot.path, 'teledrive_chunks', uploadId));
    await temp.create(recursive: true);
    final input = await source.open();
    try {
      for (var index = 0; index < chunkCount; index++) {
        if (completed.containsKey(index)) {
          final doneBytes = math.min((index + 1) * chunkSize, originalSize);
          onProgress?.call(doneBytes / originalSize);
          continue;
        }
        await input.setPosition(index * chunkSize);
        final bytes = math.min(chunkSize, originalSize - index * chunkSize);
        final part = await _writeChunk(input, temp, uploadId, index, chunkCount, bytes);
        final metadata = ChunkMetadata(
          role: ChunkMetadata.chunkRole,
          uploadId: uploadId,
          originalName: originalName,
          originalSize: originalSize,
          mimeType: mimeType,
          chunkCount: chunkCount,
          chunkIndex: index,
        );
        try {
          final result = await _uploadTelegramDocument(
            chatId: chatId,
            path: part.path,
            caption: metadata.toCaption(),
            onProgress: (partProgress) {
              final sent = index * chunkSize + bytes * partProgress;
              onProgress?.call((sent / originalSize).clamp(0.0, 1.0).toDouble());
            },
          );
          completed[index] = {
            'index': index,
            'fileId': result['fileId']?.toString() ?? '0',
            'messageId': result['messageId']?.toString() ?? '0',
            'size': bytes,
          };
          await prefs.setString(key, jsonEncode({
            'uploadId': uploadId,
            'completed': completed.values.toList(),
          }));
        } finally {
          if (await part.exists()) await part.delete();
        }
      }
    } finally {
      await input.close();
    }

    final ordered = completed.values.toList()
      ..sort((a, b) => (a['index'] as int).compareTo(b['index'] as int));
    final manifestMetadata = ChunkMetadata(
      role: ChunkMetadata.manifestRole,
      uploadId: uploadId,
      originalName: originalName,
      originalSize: originalSize,
      mimeType: mimeType,
      chunkCount: chunkCount,
    );
    final manifestFile = File(p.join(temp.path, '$_manifestPrefix$uploadId.tdmanifest'));
    await manifestFile.writeAsString(jsonEncode({
      ...manifestMetadata.toJson(),
      'chunks': ordered,
      'createdAt': DateTime.now().toUtc().toIso8601String(),
    }), flush: true);
    Map<String, dynamic> manifestResult;
    try {
      manifestResult = await _uploadTelegramDocument(
        chatId: chatId,
        path: manifestFile.path,
        caption: manifestMetadata.toCaption(),
      );
    } finally {
      if (await manifestFile.exists()) await manifestFile.delete();
      if (await temp.exists()) await temp.delete(recursive: true);
    }
    await prefs.remove(key);
    onProgress?.call(1);
    final chunks = ordered.map((part) => DriveChunk(
      index: part['index'] as int,
      telegramFileId: part['fileId'].toString(),
      telegramMessageId: part['messageId'].toString(),
      size: part['size'] as int,
    )).toList();
    final manifestMessage = manifestResult['messageId']?.toString() ?? '0';
    return DriveFile(
      id: 'chunked:$uploadId',
      telegramMessageId: manifestMessage,
      telegramMessageIds: [
        manifestMessage,
        ...chunks.map((chunk) => chunk.telegramMessageId),
      ],
      folderId: folderId,
      name: originalName,
      type: _resolveType({'fileName': originalName, 'mimeType': mimeType}),
      size: originalSize,
      uploadedAt: DateTime.now(),
      localPath: source.path,
      mimeType: mimeType,
      isDownloaded: true,
      chunkUploadId: uploadId,
      chunks: chunks,
    );
  }

  @override
  Future<List<DriveFile>> searchFiles(String query, {String? folderId}) async {
    final q = query.trim().toLowerCase();
    return (await getFiles(folderId: folderId))
        .where((file) => file.name.toLowerCase().contains(q))
        .toList();
  }

  @override
  Future<void> deleteFile(DriveFile file) => deleteFiles([file]);

  @override
  Future<void> deleteFiles(List<DriveFile> files) async {
    if (files.isEmpty) return;
    final byChat = <int, Set<int>>{};
    for (final file in files) {
      final chatId = await _chatIdFor(file.folderId);
      if (chatId == 0) continue;
      for (final id in file.allTelegramMessageIds) {
        final messageId = int.tryParse(id);
        if (messageId != null && messageId != 0) {
          byChat.putIfAbsent(chatId, () => <int>{}).add(messageId);
        }
      }
    }
    for (final entry in byChat.entries) {
      await NativeTelegramChannel.deleteMessages(
        chatId: entry.key,
        messageIds: entry.value.toList(),
        revoke: true,
      );
    }
  }

  @override
  Future<DriveFile> renameFile(DriveFile file, String newName) async {
    var trimmed = newName.trim();
    if (trimmed.isEmpty || trimmed.contains('/') || trimmed.contains('\\')) {
      throw ArgumentError('Enter a valid file name.');
    }
    final oldExt = _extension(file.name);
    if (oldExt.isNotEmpty && _extension(trimmed).isEmpty) {
      trimmed = '$trimmed.$oldExt';
    }
    if (trimmed == file.name) return file;
    final sourcePath = await downloadFile(file: file);
    final tempRoot = await getTemporaryDirectory();
    final directory = Directory(p.join(
      tempRoot.path,
      'teledrive_rename',
      DateTime.now().microsecondsSinceEpoch.toString(),
    ));
    await directory.create(recursive: true);
    final renamed = File(p.join(directory.path, _safeFileName(trimmed)));
    await File(sourcePath).copy(renamed.path);
    try {
      final replacement = await uploadFile(
        localPath: renamed.path,
        fileName: trimmed,
        folderId: file.folderId,
      );
      await deleteFile(file);
      return replacement;
    } finally {
      if (await directory.exists()) await directory.delete(recursive: true);
    }
  }

  @override
  Future<List<DriveFile>> copyFiles(
    List<DriveFile> files,
    String destinationFolderId, {
    void Function(double progress)? onProgress,
  }) async {
    final copied = <DriveFile>[];
    for (var i = 0; i < files.length; i++) {
      final file = files[i];
      final path = await downloadFile(file: file, onProgress: (value) {
        onProgress?.call((i + value * 0.45) / files.length);
      });
      copied.add(await uploadFile(
        localPath: path,
        fileName: file.name,
        folderId: destinationFolderId,
        onProgress: (value) {
          onProgress?.call((i + 0.45 + value * 0.55) / files.length);
        },
      ));
    }
    onProgress?.call(1);
    return copied;
  }

  @override
  Future<List<DriveFile>> moveFiles(
    List<DriveFile> files,
    String destinationFolderId, {
    void Function(double progress)? onProgress,
  }) async {
    if (files.every((file) => file.folderId == destinationFolderId)) return files;
    final moved = await copyFiles(files, destinationFolderId,
        onProgress: onProgress);
    await deleteFiles(files);
    return moved;
  }

  @override
  Future<DriveFolder> createFolder(String name) async {
    final title = name.trim();
    if (title.isEmpty) throw ArgumentError('Folder name cannot be empty.');
    final result = await NativeTelegramChannel.createFolder(title: title);
    final id = (result['id'] as num).toInt().toString();
    return DriveFolder(
      id: id,
      title: result['title']?.toString() ?? title,
      telegramChannelId: id,
      createdAt: DateTime.now(),
      fileCount: 0,
    );
  }

  @override
  Future<DriveFolder> renameFolder(DriveFolder folder, String newName) async {
    if (folder.isSavedMessages) {
      throw UnsupportedError('Saved Messages cannot be renamed.');
    }
    final title = newName.trim();
    if (title.isEmpty) throw ArgumentError('Folder name cannot be empty.');
    await NativeTelegramChannel.renameFolder(
      chatId: int.parse(folder.telegramChannelId),
      title: title,
    );
    return folder.copyWith(title: title);
  }

  @override
  Future<void> deleteFolder(DriveFolder folder) async {
    if (folder.isSavedMessages) {
      throw UnsupportedError('Saved Messages cannot be deleted.');
    }
    await NativeTelegramChannel.deleteFolder(
      chatId: int.parse(folder.telegramChannelId),
    );
    final prefs = await SharedPreferences.getInstance();
    final imported = prefs.getStringList('imported_folders') ?? const [];
    await prefs.setStringList('imported_folders',
        imported.where((value) => !value.startsWith('${folder.id}:')).toList());
  }
}
