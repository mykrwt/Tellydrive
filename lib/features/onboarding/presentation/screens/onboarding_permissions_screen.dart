import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../services/storage/secure_storage_service.dart';

/// Final onboarding gate. The user cannot enter the app until:
///   • notification permission is granted (where the Android version makes it
///     a runtime permission), and
///   • battery optimization is disabled for the app.
///
/// Each step verifies its real state — opening system settings does not count
/// as success. The screen re-checks on app resume so retrying works.
class OnboardingPermissionsScreen extends ConsumerStatefulWidget {
  const OnboardingPermissionsScreen({super.key});

  @override
  ConsumerState<OnboardingPermissionsScreen> createState() =>
      _OnboardingPermissionsScreenState();
}

class _OnboardingPermissionsScreenState
    extends ConsumerState<OnboardingPermissionsScreen>
    with WidgetsBindingObserver {
  PermissionStatus _notification = PermissionStatus.denied;
  PermissionStatus _battery = PermissionStatus.denied;
  bool _checking = true;
  bool _notifDialogShown = false;
  bool _completing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refreshStatuses();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Re-verify after the user returns from system settings.
    if (state == AppLifecycleState.resumed) _refreshStatuses();
  }

  Future<void> _refreshStatuses() async {
    setState(() => _checking = true);
    final results = await Future.wait([
      Permission.notification.status,
      Permission.ignoreBatteryOptimizations.status,
    ]);
    if (!mounted) return;
    setState(() {
      _notification = results[0] as PermissionStatus;
      _battery = results[1] as PermissionStatus;
      _checking = false;
    });
  }

  Future<void> _requestNotifications() async {
    if (_notification.isGranted) return;
    final result = await Permission.notification.request();
    _notifDialogShown = true;
    if (!mounted) return;
    setState(() => _notification = result);
  }

  Future<void> _openNotificationSettings() async {
    await openAppSettings();
  }

  Future<void> _requestBattery() async {
    // Requesting opens the system battery-optimization screen / dialog.
    final result = await Permission.ignoreBatteryOptimizations.request();
    if (!mounted) return;
    setState(() => _battery = result);
  }

  bool get _notificationsOk =>
      _notification.isGranted || _notification.isLimited;

  bool get _batteryOk => _battery.isGranted;

  Future<void> _complete() async {
    if (!_notificationsOk || !_batteryOk || _completing) return;
    setState(() => _completing = true);
    await SecureStorageService.instance
        .write(StorageKeys.onboardingCompleted, 'true');
    if (!mounted) return;
    context.go(AppRoutes.drive);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Finish setup',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          children: [
            Text(
              'A couple of quick permissions keep backups and uploads running '
              'reliably. You can change these later in Settings.',
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: 24),
            _PermissionStep(
              icon: Icons.notifications_active_outlined,
              title: 'Notifications',
              description: _notifDialogShown && !_notificationsOk
                  ? 'Notifications are still off. Enable them in system settings '
                      'so you get upload progress, backup status, and failure alerts.'
                  : 'Get notified about upload progress, backup status, and '
                      'failed or completed transfers.',
              state: _stepState(_notificationsOk),
              actionLabel: _notificationsOk
                  ? 'Done'
                  : (_notifDialogShown || _notification.isPermanentlyDenied
                      ? 'Open settings'
                      : 'Allow'),
              onAction: _notificationsOk
                  ? _requestNotifications
                  : (_notifDialogShown || _notification.isPermanentlyDenied
                      ? _openNotificationSettings
                      : _requestNotifications),
            ),
            const SizedBox(height: 14),
            _PermissionStep(
              icon: Icons.battery_charging_full_outlined,
              title: 'Disable battery optimization',
              description: _batteryOk
                  ? 'Background activity is allowed — Auto Backup and uploads '
                      'can continue when the app is in the background.'
                  : 'Android may pause TeleDrive in the background, which can '
                      'interrupt uploads and Auto Backup. Disabling battery '
                      'optimization keeps them running reliably.',
              state: _stepState(_batteryOk),
              actionLabel: _batteryOk ? 'Done' : 'Open setting',
              onAction: _requestBattery,
            ),
            const SizedBox(height: 28),
            if (_checking)
              const Padding(
                padding: EdgeInsets.all(8),
                child: Center(
                    child: SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2))),
              ),
            FilledButton(
              onPressed: (_notificationsOk && _batteryOk && !_checking)
                  ? _complete
                  : null,
              child: _completing
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Enter TeleDrive'),
            ),
            const SizedBox(height: 10),
            Text(
              _notificationsOk && _batteryOk
                  ? ''
                  : 'Both permissions are required before you can continue.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.error),
            ),
          ],
        ),
      ),
    );
  }

  _StepState _stepState(bool ok) => ok ? _StepState.done : _StepState.pending;
}

enum _StepState { done, pending }

class _PermissionStep extends StatelessWidget {
  const _PermissionStep({
    required this.icon,
    required this.title,
    required this.description,
    required this.state,
    required this.actionLabel,
    required this.onAction,
  });

  final IconData icon;
  final String title;
  final String description;
  final _StepState state;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final done = state == _StepState.done;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            shape: BoxShape.circle,
            border: Border.all(
                color: theme.colorScheme.outline.withValues(alpha: 0.4)),
          ),
          child: Icon(done ? Icons.check_rounded : icon,
              color: theme.colorScheme.onSurface),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text(description, style: theme.textTheme.bodySmall),
              if (!done) ...[
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: onAction,
                    icon: const Icon(Icons.open_in_new_rounded, size: 18),
                    label: Text(actionLabel),
                  ),
                ),
              ],
            ],
          ),
        ),
      ]),
    );
  }
}
