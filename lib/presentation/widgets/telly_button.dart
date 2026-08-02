import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// TellyBase's primary call-to-action button: full-width, pill-shaped,
/// gradient fill, with a subtle press-scale animation reminiscent of iOS
/// buttons rather than Material's default ripple.
class TellyButton extends StatefulWidget {
  const TellyButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.isLoading = false,
    this.isDestructive = false,
    this.isSecondary = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;
  final bool isDestructive;
  final bool isSecondary;

  @override
  State<TellyButton> createState() => _TellyButtonState();
}

class _TellyButtonState extends State<TellyButton> {
  double _scale = 1;

  @override
  Widget build(BuildContext context) {
    final disabled = widget.onPressed == null || widget.isLoading;

    return GestureDetector(
      onTapDown: disabled ? null : (_) => setState(() => _scale = 0.97),
      onTapUp: disabled ? null : (_) => setState(() => _scale = 1),
      onTapCancel: disabled ? null : () => setState(() => _scale = 1),
      onTap: disabled ? null : widget.onPressed,
      child: AnimatedScale(
        scale: _scale,
        duration: AppMotion.fast,
        curve: Curves.easeOut,
        child: Container(
          height: 54,
          width: double.infinity,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: widget.isSecondary
                ? null
                : LinearGradient(
                    colors: widget.isDestructive
                        ? [AppColors.systemRed, AppColors.systemPink]
                        : [AppColors.systemBlue, AppColors.systemPurple],
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                  ),
            color: widget.isSecondary ? AppTheme.tertiaryBgOf(context) : null,
            boxShadow: disabled || widget.isSecondary
                ? []
                : [
                    BoxShadow(
                      color: (widget.isDestructive ? AppColors.systemRed : AppColors.systemBlue)
                          .withOpacity(0.3),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ],
          ),
          child: widget.isLoading
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                )
              : Text(
                  widget.label,
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                    color: widget.isSecondary ? AppTheme.labelOf(context) : Colors.white,
                  ),
                ),
        ),
      ),
    );
  }
}
