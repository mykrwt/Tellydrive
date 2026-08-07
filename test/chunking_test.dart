import 'package:flutter_test/flutter_test.dart';
import 'package:tellybase/core/error/app_exception.dart';
import 'package:tellybase/core/utils/chunking.dart';

void main() {
  group('ChunkingPlan.forSize', () {
    test('small files are a single chunk', () {
      final plan = ChunkingPlan.forSize(1000);
      expect(plan.chunkCount, 1);
      expect(plan.rangeFor(0), (start: 0, end: 1000));
      expect(plan.sizeFor(0), 1000);
    });

    test('files over the chunk size are split', () {
      const chunk = 100;
      final plan = ChunkingPlan.forSize(250, chunkSize: chunk);
      expect(plan.chunkCount, 3);
      expect(plan.rangeFor(0), (start: 0, end: 100));
      expect(plan.rangeFor(1), (start: 100, end: 200));
      expect(plan.rangeFor(2), (start: 200, end: 250));
      expect(plan.sizeFor(2), 50);
    });

    test('exact multiple of chunk size', () {
      const chunk = 100;
      final plan = ChunkingPlan.forSize(300, chunkSize: chunk);
      expect(plan.chunkCount, 3);
      expect(plan.rangeFor(2), (start: 200, end: 300));
    });

    test('throws on negative size', () {
      expect(() => ChunkingPlan.forSize(-1), throwsA(isA<AppException>()));
    });

    test('throws when too many chunks would be needed', () {
      expect(
        () => ChunkingPlan.forSize(2 << 40, chunkSize: 1024),
        throwsA(isA<ChunkedFileException>()),
      );
    });

    test('out-of-range chunk index throws', () {
      final plan = ChunkingPlan.forSize(100);
      expect(() => plan.rangeFor(5), throwsA(isA<ChunkedFileException>()));
    });
  });
}
