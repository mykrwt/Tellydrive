import 'dart:io';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:tellybase_mobile/core/config/app_config.dart';
import 'package:tellybase_mobile/core/error/app_exception.dart';
import 'package:tellybase_mobile/core/network/api_client.dart';
import 'package:tellybase_mobile/features/storage/data/models/cloud_file_model.dart';
import 'package:tellybase_mobile/features/storage/data/models/cloud_folder_model.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_file.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_folder.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/file_page.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/upload_request.dart';

class StorageRemoteDataSource {
  const StorageRemoteDataSource(this._client);
  final ApiClient _client;

  Future<CloudFolder> createFolder({required String name, String? parentId}) async {
    final json = await _client.postJson(
      '/api/folders',
      data: <String, Object?>{'name': name, 'parentId': parentId},
    );
    return _folderFromValue(json['folder']);
  }

  Future<void> deleteFile(String id) async {
    await _client.deleteJson('/api/files/${Uri.encodeComponent(id)}');
  }

  Future<void> deleteFolder(String id) async {
    await _client.deleteJson('/api/folders/${Uri.encodeComponent(id)}');
  }

  Future<void> downloadFile({
    required String id,
    required String destinationPath,
  }) =>
      _client.download(
        '/api/files/${Uri.encodeComponent(id)}?download=1&proxy=1',
        destinationPath,
      );

  Future<List<CloudFolder>> getAllFolders() async {
    final json = await _client.getJson(
      '/api/folders',
      queryParameters: const <String, Object>{'all': '1'},
    );
    return _folderList(json['folders']);
  }

  Future<FolderContents> getFolderContents(String? folderId) async {
    final folderQuery = folderId == null
        ? const <String, Object>{'root': '1'}
        : <String, Object>{'parentId': folderId};
    final fileQuery = folderId == null
        ? const <String, Object>{
            'root': '1',
            'section': 'files',
            'limit': 500,
            'sortBy': 'name',
            'sortOrder': 'asc',
          }
        : <String, Object>{
            'folderId': folderId,
            'section': 'files',
            'limit': 500,
            'sortBy': 'name',
            'sortOrder': 'asc',
          };

    final responses = await Future.wait<Map<String, dynamic>>([
      _client.getJson('/api/folders', queryParameters: folderQuery),
      _client.getJson('/api/files', queryParameters: fileQuery),
      if (folderId != null)
        _client.getJson('/api/folders/${Uri.encodeComponent(folderId)}'),
    ]);
    final path = folderId == null
        ? const <CloudFolder>[]
        : _folderList(responses[2]['path']);
    return FolderContents(
      folderId: folderId,
      folders: _folderList(responses[0]['folders']),
      files: _fileList(responses[1]['files']),
      path: path,
    );
  }

  Future<FilePage> getMedia({
    required int offset,
    required int limit,
    required String search,
    required MediaFilter filter,
    required FileSort sort,
  }) async {
    final mime = switch (filter) {
      MediaFilter.images => 'image',
      MediaFilter.videos => 'video',
      _ => 'all',
    };
    final sortBy = switch (sort) {
      FileSort.nameAscending => 'name',
      FileSort.sizeDescending => 'size',
      _ => 'date',
    };
    final sortOrder = switch (sort) {
      FileSort.dateOldest || FileSort.nameAscending => 'asc',
      _ => 'desc',
    };
    final json = await _client.getJson(
      '/api/files',
      queryParameters: <String, Object>{
        'limit': limit,
        'offset': offset,
        'search': search,
        'mime': mime,
        'sortBy': sortBy,
        'sortOrder': sortOrder,
        'media': '1',
        'section': 'gallery',
      },
    );
    var files = _fileList(json['files']);
    if (filter == MediaFilter.favorites) {
      files = files.where((file) => file.favorite).toList(growable: false);
    }
    final serverTotal = json['total'];
    return FilePage(
      files: files,
      total: filter == MediaFilter.favorites
          ? files.length
          : serverTotal is num
              ? serverTotal.toInt()
              : files.length,
    );
  }

  Future<void> moveFile({required String id, String? folderId}) async {
    await _client.patchJson(
      '/api/files/${Uri.encodeComponent(id)}',
      data: <String, Object?>{'folderId': folderId},
    );
  }

  Future<void> moveFolder({required String id, String? parentId}) async {
    await _client.patchJson(
      '/api/folders/${Uri.encodeComponent(id)}',
      data: <String, Object?>{'parentId': parentId},
    );
  }

  Future<void> renameFile({required String id, required String name}) async {
    await _client.patchJson(
      '/api/files/${Uri.encodeComponent(id)}',
      data: <String, Object>{'name': name},
    );
  }

  Future<void> renameFolder({required String id, required String name}) async {
    await _client.patchJson(
      '/api/folders/${Uri.encodeComponent(id)}',
      data: <String, Object>{'name': name},
    );
  }

  Future<void> setFavorite({required String id, required bool favorite}) async {
    await _client.patchJson(
      '/api/mobile/v1/files/${Uri.encodeComponent(id)}/favorite',
      data: <String, Object>{'favorite': favorite},
    );
  }

  Future<String> upload(
    UploadRequest request, {
    UploadProgressCallback? onProgress,
  }) async {
    if (request.size <= 0 || request.size > AppConfig.maxUploadBytes) {
      throw const AppException('Files must be between 1 byte and 2 GB.');
    }
    final sourceFile = File(request.path);
    if (!await sourceFile.exists()) {
      throw const AppException('The selected file is no longer available.');
    }

    final count = (request.size / AppConfig.uploadPartBytes).ceil();
    final uploadId = _uploadId();
    final tokens = <String>[];
    final handle = await sourceFile.open();
    var completedBytes = 0;
    try {
      for (var index = 0; index < count; index += 1) {
        final remaining = request.size - completedBytes;
        final readLength = min(AppConfig.uploadPartBytes, remaining);
        final bytes = await handle.read(readLength);
        if (bytes.isEmpty) throw const AppException('Could not read the selected file.');

        final form = FormData.fromMap(<String, Object?>{
          'file': MultipartFile.fromBytes(
            bytes,
            filename: '${request.name}.part${index + 1}',
          ),
          'name': request.name,
          'index': index,
          'count': count,
          'size': request.size,
          'mimeType': request.mimeType,
          'source': request.source,
          'folderId': request.folderId ?? '',
          'uploadId': uploadId,
        });
        final partStart = completedBytes;
        final response = await _client.postJson(
          '/api/files/upload-part',
          data: form,
          onSendProgress: (sent, _) => onProgress?.call(
            UploadProgress(
              fileName: request.name,
              bytesSent: min(request.size, partStart + min(sent, bytes.length)),
              totalBytes: request.size,
              part: index + 1,
              partCount: count,
            ),
          ),
        );
        final token = response['token'];
        if (token is! String) {
          throw const AppException('The upload part was not accepted.');
        }
        tokens.add(token);
        completedBytes += bytes.length;
        onProgress?.call(
          UploadProgress(
            fileName: request.name,
            bytesSent: completedBytes,
            totalBytes: request.size,
            part: index + 1,
            partCount: count,
          ),
        );
      }
    } finally {
      await handle.close();
    }

    final finalized = await _client.postJson(
      '/api/files/finalize',
      data: <String, Object>{
        'uploadId': uploadId,
        'parts': tokens,
      },
    );
    final id = finalized['id'];
    if (id is! String) throw const AppException('The upload could not be finalized.');
    return id;
  }

  List<CloudFile> _fileList(Object? value) {
    if (value is! List<Object?>) return const <CloudFile>[];
    return value
        .whereType<Map<Object?, Object?>>()
        .map(
          (json) => CloudFileModel.fromJson(
            json.map((key, entry) => MapEntry(key.toString(), entry)),
          ).toEntity(),
        )
        .toList(growable: false);
  }

  CloudFolder _folderFromValue(Object? value) {
    if (value is! Map<Object?, Object?>) {
      throw const AppException('The server returned an invalid folder.');
    }
    return CloudFolderModel.fromJson(
      value.map((key, entry) => MapEntry(key.toString(), entry)),
    ).toEntity();
  }

  List<CloudFolder> _folderList(Object? value) {
    if (value is! List<Object?>) return const <CloudFolder>[];
    return value
        .whereType<Map<Object?, Object?>>()
        .map(
          (json) => CloudFolderModel.fromJson(
            json.map((key, entry) => MapEntry(key.toString(), entry)),
          ).toEntity(),
        )
        .toList(growable: false);
  }

  String _uploadId() {
    final random = Random.secure();
    final suffix = List<int>.generate(12, (_) => random.nextInt(256))
        .map((value) => value.toRadixString(16).padLeft(2, '0'))
        .join();
    return '${DateTime.now().microsecondsSinceEpoch}_$suffix';
  }
}
