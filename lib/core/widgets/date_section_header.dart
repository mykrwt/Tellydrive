import 'package:flutter/material.dart';

/// Sticky-style day header used above each gallery section.
class DateSectionHeader extends StatelessWidget {
  const DateSectionHeader(this.label, {super.key, this.padding});

  final String label;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding ?? const EdgeInsets.fromLTRB(16, 18, 16, 10),
      child: Text(
        label,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
      ),
    );
  }
}
