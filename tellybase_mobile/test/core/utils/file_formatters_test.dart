import 'package:flutter_test/flutter_test.dart';
import 'package:tellybase_mobile/core/utils/file_formatters.dart';

void main() {
  group('FileFormatters.bytes', () {
    test('formats byte and binary unit values', () {
      expect(FileFormatters.bytes(0), '0 B');
      expect(FileFormatters.bytes(1024), '1.00 KB');
      expect(FileFormatters.bytes(10 * 1024 * 1024), '10.0 MB');
    });
  });

  test('extracts an uppercase extension', () {
    expect(FileFormatters.extension('archive.tar.gz'), 'GZ');
    expect(FileFormatters.extension('README'), isEmpty);
  });

  test('sanitizes Android-incompatible file name characters', () {
    expect(FileFormatters.safeFileName('report:final?.pdf'), 'report_final_.pdf');
  });
}
