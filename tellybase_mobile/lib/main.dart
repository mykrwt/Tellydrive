import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tellybase_mobile/app/tellybase_app.dart';
import 'package:tellybase_mobile/core/di/providers.dart';
import 'package:tellybase_mobile/core/storage/preferences_storage.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final preferences = await SharedPreferences.getInstance();
  runApp(
    ProviderScope(
      overrides: [
        preferencesStorageProvider.overrideWithValue(
          SharedPreferencesStorage(preferences),
        ),
      ],
      child: const TellyBaseApp(),
    ),
  );
}
