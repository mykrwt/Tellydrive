import 'package:flutter/material.dart';
import 'package:tellybase_mobile/features/storage/domain/entities/cloud_file.dart';

class FileKindIcon extends StatelessWidget {
  const FileKindIcon({required this.file, this.size = 48, super.key});

  final CloudFile file;
  final double size;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (file.kind) {
      CloudFileKind.image => (Icons.image_outlined, const Color(0xFF58C7F3)),
      CloudFileKind.video => (Icons.movie_outlined, const Color(0xFFB47AF2)),
      CloudFileKind.audio => (Icons.graphic_eq_rounded, const Color(0xFFF0AF55)),
      CloudFileKind.archive => (Icons.inventory_2_outlined, const Color(0xFFEE79AD)),
      CloudFileKind.code => (Icons.code_rounded, const Color(0xFF4DD3A6)),
      CloudFileKind.document => (Icons.description_outlined, const Color(0xFF8995FF)),
      CloudFileKind.other => (Icons.insert_drive_file_outlined, const Color(0xFF9AA4B8)),
    };
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(size * 0.3),
      ),
      child: Icon(icon, color: color, size: size * 0.48),
    );
  }
}
