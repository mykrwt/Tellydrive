import 'package:dio/dio.dart';

class AppException implements Exception {
  const AppException(
    this.message, {
    this.statusCode,
    this.retryAfter,
    this.cause,
  });

  factory AppException.fromDio(DioException error) {
    final response = error.response;
    final data = response?.data;
    String? serverMessage;
    if (data is Map<String, dynamic>) {
      final value = data['error'];
      if (value is String && value.trim().isNotEmpty) serverMessage = value;
    } else if (data is Map<Object?, Object?>) {
      final value = data['error'];
      if (value is String && value.trim().isNotEmpty) serverMessage = value;
    }

    final statusCode = response?.statusCode;
    final retryValue = response?.headers.value('retry-after');
    final retryAfter = retryValue == null ? null : int.tryParse(retryValue);
    final fallback = switch (error.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout =>
        'The request timed out. Check your connection and try again.',
      DioExceptionType.connectionError =>
        'Unable to reach TellyBase. Check your connection.',
      DioExceptionType.cancel => 'The request was cancelled.',
      _ when statusCode == 401 => 'Your session has expired. Sign in again.',
      _ when statusCode == 403 => 'You do not have permission to do that.',
      _ when statusCode == 404 => 'The requested item was not found.',
      _ when statusCode == 429 => 'Too many requests. Please wait a moment.',
      _ when statusCode != null && statusCode >= 500 =>
        'TellyBase is temporarily unavailable.',
      _ => 'Something went wrong. Please try again.',
    };
    return AppException(
      serverMessage ?? fallback,
      statusCode: statusCode,
      retryAfter: retryAfter,
      cause: error,
    );
  }

  final String message;
  final int? statusCode;
  final int? retryAfter;
  final Object? cause;

  @override
  String toString() => message;
}
