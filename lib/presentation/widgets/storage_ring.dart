import 'dart:math';

import 'package:flutter/material.dart';

import '../../core/constants/app_constants.dart';
import '../../core/theme/app_theme.dart';

/// An Apple "Activity ring"-style storage usage visualization: a stacked
/// ring per file category, animated in on load, with the total human
/// readable size in the center — used on the Home dashboard for the
/// "storage usage statistics" requirement.
class StorageRing extends StatelessWidget {
  const StorageRing({
    super.key,
    required this.byCategory,
    required this.totalBytes,
  });

  final Map<TellyFileCategory, int> byCategory;
  final int totalBytes;

  static const _colors = {
    TellyFileCategory.photo: AppColors.systemBlue,
    TellyFileCategory.video: AppColors.systemPurple,
    TellyFileCategory.document: AppColors.systemOrange,
    TellyFileCategory.audio: AppColors.systemPink,
    TellyFileCategory.other: AppColors.systemTeal,
  };

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 900),
      curve: Curves.easeOutCubic,
      builder: (context, t, _) {
        return SizedBox(
          width: 200,
          height: 200,
          child: Stack(
            alignment: Alignment.center,
            children: [
              CustomPaint(
                size: const Size(200, 200),
                painter: _RingPainter(
                  byCategory: byCategory,
                  totalBytes: totalBytes == 0 ? 1 : totalBytes,
                  animationValue: t,
                  trackColor: AppTheme.tertiaryBgOf(context),
                ),
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _humanSize(totalBytes),
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  Text('Total Backed Up', style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  static String _humanSize(int bytes) {
    if (bytes <= 0) return '0 MB';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var value = bytes.toDouble();
    var unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    return '${value.toStringAsFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}';
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({
    required this.byCategory,
    required this.totalBytes,
    required this.animationValue,
    required this.trackColor,
  });

  final Map<TellyFileCategory, int> byCategory;
  final int totalBytes;
  final double animationValue;
  final Color trackColor;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = size.width / 2 - 12;
    final strokeWidth = 18.0;

    final trackPaint = Paint()
      ..color = trackColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawCircle(center, radius, trackPaint);

    var startAngle = -pi / 2;
    for (final entry in byCategory.entries) {
      final fraction = entry.value / totalBytes;
      if (fraction <= 0) continue;
      final sweep = 2 * pi * fraction * animationValue;
      final paint = Paint()
        ..color = StorageRing._colors[entry.key] ?? AppColors.systemBlue
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        sweep,
        false,
        paint,
      );
      startAngle += 2 * pi * fraction;
    }
  }

  @override
  bool shouldRepaint(covariant _RingPainter oldDelegate) =>
      oldDelegate.animationValue != animationValue || oldDelegate.byCategory != byCategory;
}
