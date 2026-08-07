import 'package:intl/intl.dart';

/// Human-friendly date helpers used by the gallery grouping.
class DateFormatters {
  DateFormatters._();

  static final DateFormat _time = DateFormat('h:mm a');
  static final DateFormat _dayMonth = DateFormat('MMMM d');
  static final DateFormat _full = DateFormat('MMMM d, yyyy');
  static final DateFormat _shortMonthDay = DateFormat('MMM d');
  static final DateFormat _yearMonthDay = DateFormat('yyyy-MM-dd');

  /// Grouping label for a date in the gallery: "Today", "Yesterday", or a date.
  static String groupLabel(DateTime date, {DateTime? now}) {
    final n = now ?? DateTime.now();
    final day = DateTime(date.year, date.month, date.day);
    final today = DateTime(n.year, n.month, n.day);
    final diff = today.difference(day).inDays;

    if (diff == 0) return 'Today';
    if (diff == 1) return 'Yesterday';
    if (day.year == today.year) return _dayMonth.format(day);
    return _full.format(day);
  }

  /// Compact timestamp used in the viewer.
  static String detailTimestamp(DateTime date) {
    final now = DateTime.now();
    if (date.year == now.year) {
      return '${_dayMonth.format(date)} · ${_time.format(date)}';
    }
    return '${_full.format(date)} · ${_time.format(date)}';
  }

  static String monthLabel(DateTime date) => DateFormat('MMMM yyyy').format(date);

  static String shortMonthDay(DateTime date) => _shortMonthDay.format(date);

  static String key(DateTime date) => _yearMonthDay.format(date);
}
