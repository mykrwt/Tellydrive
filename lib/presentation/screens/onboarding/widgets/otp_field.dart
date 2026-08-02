import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme/app_theme.dart';

/// A 5-digit code entry row styled like Apple's SMS/2FA code fields:
/// individually boxed digits with an animated focus highlight.
class OtpField extends StatefulWidget {
  const OtpField({super.key, required this.controller, this.length = 5});
  final TextEditingController controller;
  final int length;

  @override
  State<OtpField> createState() => _OtpFieldState();
}

class _OtpFieldState extends State<OtpField> {
  final _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(() => setState(() {}));
  }

  @override
  Widget build(BuildContext context) {
    final text = widget.controller.text;

    return GestureDetector(
      onTap: () => _focusNode.requestFocus(),
      child: Stack(
        children: [
          Opacity(
            opacity: 0,
            child: TextField(
              controller: widget.controller,
              focusNode: _focusNode,
              keyboardType: TextInputType.number,
              maxLength: widget.length,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              autofocus: true,
            ),
          ),
          Positioned.fill(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(widget.length, (i) {
                final filled = i < text.length;
                final isCurrent = i == text.length;
                return AnimatedContainer(
                  duration: AppMotion.fast,
                  curve: Curves.easeOut,
                  width: 52,
                  height: 60,
                  decoration: BoxDecoration(
                    color: AppTheme.tertiaryBgOf(context),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: isCurrent ? AppColors.systemBlue : Colors.transparent,
                      width: 2,
                    ),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    filled ? text[i] : '',
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }
}
