import 'package:flutter/material.dart';

class AppLogo extends StatelessWidget {
  const AppLogo({this.compact = false, super.key});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: compact ? 36 : 44,
          height: compact ? 36 : 44,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(compact ? 12 : 15),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF8995FF), Color(0xFF5665E8)],
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x555665E8),
                blurRadius: 20,
                offset: Offset(0, 8),
              ),
            ],
          ),
          child: Icon(
            Icons.cloud_rounded,
            color: Colors.white,
            size: compact ? 20 : 25,
          ),
        ),
        if (!compact) ...[
          const SizedBox(width: 12),
          Text(
            'TellyBase',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.8,
                ),
          ),
        ],
      ],
    );
  }
}
