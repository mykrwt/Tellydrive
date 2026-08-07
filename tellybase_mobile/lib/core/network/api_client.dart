import 'dart:async';

import 'package:dio/dio.dart';
import 'package:tellybase_mobile/core/config/app_config.dart';
import 'package:tellybase_mobile/core/error/app_exception.dart';
import 'package:tellybase_mobile/core/storage/secure_session_storage.dart';

class ApiClient {
  ApiClient({required SessionStorage sessionStorage, Dio? dio})
      : _sessionStorage = sessionStorage,
        _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: AppConfig.apiBaseUrl,
                connectTimeout: const Duration(seconds: 20),
                receiveTimeout: const Duration(seconds: 60),
                sendTimeout: const Duration(minutes: 2),
                headers: const <String, Object>{
                  'Accept': 'application/json',
                  'X-TellyBase-Client': 'android/1.0',
                },
                validateStatus: (status) => status != null && status < 400,
              ),
            ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final cookie = await _sessionStorage.readCookie();
          if (cookie != null && cookie.isNotEmpty) {
            options.headers['Cookie'] = cookie;
          }
          handler.next(options);
        },
        onResponse: (response, handler) async {
          await _captureSessionCookie(response.headers['set-cookie']);
          handler.next(response);
        },
        onError: (error, handler) async {
          await _captureSessionCookie(error.response?.headers['set-cookie']);
          handler.next(error);
        },
      ),
    );
  }

  static const _sessionName = 'tellydrive_session';
  final Dio _dio;
  final SessionStorage _sessionStorage;

  Dio get dio => _dio;

  Future<Map<String, dynamic>> deleteJson(
    String path, {
    Object? data,
  }) => _jsonRequest(() => _dio.delete<Object?>(path, data: data));

  Future<void> download(
    String path,
    String savePath, {
    ProgressCallback? onReceiveProgress,
  }) async {
    try {
      await _dio.download(
        path,
        savePath,
        onReceiveProgress: onReceiveProgress,
        options: Options(
          receiveTimeout: const Duration(minutes: 10),
          responseType: ResponseType.bytes,
        ),
      );
    } on DioException catch (error) {
      throw AppException.fromDio(error);
    }
  }

  Future<Map<String, dynamic>> getJson(
    String path, {
    Map<String, Object?>? queryParameters,
  }) =>
      _jsonRequest(
        () => _dio.get<Object?>(path, queryParameters: queryParameters),
      );

  Future<Map<String, dynamic>> patchJson(
    String path, {
    Object? data,
  }) => _jsonRequest(() => _dio.patch<Object?>(path, data: data));

  Future<Map<String, dynamic>> postJson(
    String path, {
    Object? data,
    ProgressCallback? onSendProgress,
  }) =>
      _jsonRequest(
        () => _dio.post<Object?>(
          path,
          data: data,
          onSendProgress: onSendProgress,
        ),
      );

  Future<Map<String, dynamic>> _jsonRequest(
    Future<Response<Object?>> Function() request,
  ) async {
    try {
      final response = await request();
      final data = response.data;
      if (data == null) return <String, dynamic>{};
      if (data is Map<String, dynamic>) return data;
      if (data is Map<Object?, Object?>) {
        return data.map((key, value) => MapEntry(key.toString(), value));
      }
      throw const AppException('The server returned an invalid response.');
    } on DioException catch (error) {
      throw AppException.fromDio(error);
    }
  }

  Future<void> _captureSessionCookie(List<String>? values) async {
    if (values == null) return;
    for (final raw in values) {
      for (final header in raw.split(RegExp(r',(?=[^;,]+=)'))) {
        final firstPart = header.split(';').first.trim();
        if (!firstPart.startsWith('$_sessionName=')) continue;
        final value = firstPart.substring(_sessionName.length + 1);
        final invalidated = value.isEmpty ||
            header.toLowerCase().contains('max-age=0') ||
            header.toLowerCase().contains('expires=thu, 01 jan 1970');
        if (invalidated) {
          await _sessionStorage.clear();
        } else {
          await _sessionStorage.writeCookie(firstPart);
        }
      }
    }
  }
}
