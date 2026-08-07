import 'package:flutter/material.dart';
import 'package:tellybase_mobile/core/widgets/app_logo.dart';

class AuthScaffold extends StatelessWidget {
  const AuthScaffold({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          Positioned(
            top: -150,
            right: -110,
            child: Container(
              width: 330,
              height: 330,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [Color(0x445E6FF2), Color(0x005E6FF2)],
                ),
              ),
            ),
          ),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 30, 24, 36),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const AppLogo(),
                  const SizedBox(height: 52),
                  child,
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
