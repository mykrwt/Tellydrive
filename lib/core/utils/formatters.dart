/// Byte-size and count formatting.
class Formatters {
  Formatters._();

  static String bytes(int? bytes) {
    if (bytes == null || bytes < 0) return '—';
    if (bytes < 1024) return '$bytes B';
    const units = ['KB', 'MB', 'GB', 'TB'];
    var value = bytes.toDouble();
    var i = -1;
    do {
      value /= 1024;
      i++;
    } while (value >= 1024 && i < units.length - 1);
    return '${value.toStringAsFixed(value >= 100 ? 0 : 1)} ${units[i]}';
  }

  static String count(int n) => n >= 1000 ? '${(n / 1000).toStringAsFixed(1)}k' : '$n';

  /// A short file-size label like "3.2 GB" used in tiles.
  static String compactBytes(int bytes) => Formatters.bytes(bytes);

  static double progressFraction({required int done, required int total}) =>
      total <= 0 ? 0 : (done / total).clamp(0, 1);
}
