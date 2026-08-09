import 'package:flutter/material.dart';

import '../../../home/presentation/screens/home_shell_screen.dart';

/// Backward-compatible entry point retained for links from older TeleDrive
/// builds. The authenticated UI now lives in the required three-tab shell.
class DriveHomeScreen extends StatelessWidget {
  const DriveHomeScreen({super.key});

  @override
  Widget build(BuildContext context) => const HomeShellScreen();
}
