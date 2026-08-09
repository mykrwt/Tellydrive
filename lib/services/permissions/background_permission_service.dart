import 'dart:io';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Handles background-related permission requests on first launch.
///
/// Only requests permissions that are actually required by the platform:
/// - Notifications (Android 13+ POST_NOTIFICATIONS) — needed for upload/backup progress
/// - Battery optimization exemption — allows background uploads/backups to continue
/// No other permissions are requested here.
class BackgroundPermissionService {
  BackgroundPermissionService._();

  static const _askedKey = 'bg_permissions_asked';

  static Future<bool> _shouldAsk() async {
    if (!Platform.isAndroid) return false;
    final prefs = await SharedPreferences.getInstance();
    return !(prefs.getBool(_askedKey) ?? false);
  }

  static Future<void> _markAsked() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_askedKey, true);
  }

  /// Call on first startup (e.g. in TeleDriveApp init). Shows a dialog
  /// explaining why permissions are needed, then requests them.
  static Future<void> requestIfNeeded(BuildContext context) async {
    if (!await _shouldAsk()) return;
    if (!context.mounted) return;

    // Small delay so the first frame renders before dialog.
    await Future<void>.delayed(const Duration(milliseconds: 700));
    if (!context.mounted) return;

    final proceed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Allow background activity?'),
        content: const Text(
          'To keep uploads, auto backups, and file operations running reliably '
          'when the app is in the background, TeleDrive needs permission to '
          'send notifications and run background tasks.\n\n'
          'Notifications show upload and backup progress. Background access '
          'ensures they continue when you switch apps.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Not now')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Allow')),
        ],
      ),
    );

    if (proceed != true) {
      await _markAsked();
      return;
    }

    await _requestPermissions(context);
    await _markAsked();
  }

  static Future<void> _requestPermissions(BuildContext context) async {
    // 1. Notifications (Android 13+)
    if (await Permission.notification.isDenied) {
      await Permission.notification.request();
    }

    // 2. Battery optimization — prompt to ignore battery optimization so
    // background work isn't killed. This is not a runtime permission dialog
    // on many devices; we request via permission_handler which opens settings
    // if needed. Only attempt if the platform supports it.
    try {
      if (await Permission.ignoreBatteryOptimizations.isDenied) {
        // We don't force-open system settings automatically — just request.
        // On some OEMs this shows a dialog; on others it silently fails.
        await Permission.ignoreBatteryOptimizations.request();
      }
    } catch (_) {
      // ignore — not all Android builds expose this permission
    }

    if (!context.mounted) return;
    final notifStatus = await Permission.notification.status;
    final batteryStatus = await Permission.ignoreBatteryOptimizations.status;

    // Show friendly confirmation; don't block if denied.
    final allGranted = notifStatus.isGranted;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(allGranted
            ? 'Background permissions granted. Uploads will continue in background.'
            : 'Some permissions were not granted. You can enable them later in system settings.'),
      ),
    );
  }

  /// Allow user to re-request from Settings if they dismissed earlier.
  static Future<void> openSettings() async {
    await openAppSettings();
  }
}
