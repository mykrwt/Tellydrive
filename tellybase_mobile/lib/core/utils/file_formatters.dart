import 'package:intl/intl.dart';

abstract final class FileFormatters {
  static String bytes(int value) {
    if (value < 1024) return '$value B';
    const units = <String>['KB', 'MB', 'GB', 'TB'];
    var size = value.toDouble();
    var index = -1;
    do {
      size /= 1024;
      index += 1;
    } while (size >= 1024 && index < units.length - 1);
    final digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
    return '${size.toStringAsFixed(digits)} ${units[index]}';
  }

  static String date(DateTime value) {
    final now = DateTime.now();
    final local = value.toLocal();
    final startToday = DateTime(now.year, now.month, now.day);
    final startValue = DateTime(local.year, local.month, local.day);
    final difference = startToday.difference(startValue).inDays;
    if (difference == 0) return 'Today, ${DateFormat.jm().format(local)}';
    if (difference == 1) return 'Yesterday';
    if (local.year == now.year) return DateFormat.MMMd().format(local);
    return DateFormat.yMMMd().format(local);
  }

  static String extension(String name) {
    final dot = name.lastIndexOf('.');
    return dot <= 0 || dot == name.length - 1
        ? ''
        : name.substring(dot + 1).toUpperCase();
  }

  static String safeFileName(String value) => value.replaceAll(
        RegExp(r'[\\/:*?"<>|\u0000-\u001F]'),
        '_',
      );
}
