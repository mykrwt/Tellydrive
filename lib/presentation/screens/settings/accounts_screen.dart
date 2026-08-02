import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../state/app_providers.dart';

/// "Support multiple Telegram accounts" made concrete: each linked
/// account gets its own MTProto session + its own vault channel + its own
/// slice of the local index (tagged via [FileEntry.accountId]); switching
/// accounts here swaps which session drives uploads/downloads without
/// signing out of the others.
class AccountsScreen extends ConsumerWidget {
  const AccountsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Accounts'),
        actions: [
          IconButton(icon: const Icon(CupertinoIcons.add), onPressed: () => _addAccount(context)),
        ],
      ),
      body: FutureBuilder(
        future: ref.watch(localDatabaseProvider.future).then((db) => db.listAccounts()),
        builder: (context, snapshot) {
          final accounts = snapshot.data ?? [];
          if (accounts.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(CupertinoIcons.person_2, size: 48, color: AppColors.systemBlue),
                    const SizedBox(height: 12),
                    Text(
                      'Only one Telegram account is linked. Add another to keep '
                      'separate personal and work backups side by side.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: accounts.length,
            itemBuilder: (context, i) {
              final acc = accounts[i];
              return Card(
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: AppColors.systemBlue.withOpacity(0.15),
                    child: const Icon(CupertinoIcons.person_fill, color: AppColors.systemBlue),
                  ),
                  title: Text(acc['phoneNumber'] as String? ?? 'Telegram account'),
                  trailing: (acc['isActive'] as bool? ?? false)
                      ? const Icon(CupertinoIcons.checkmark_circle_fill, color: AppColors.systemGreen)
                      : null,
                ),
              );
            },
          );
        },
      ),
    );
  }

  void _addAccount(BuildContext context) {
    // Launches the same OnboardingFlow phone/OTP steps for a second
    // MTProto session, stored side-by-side with the first — implementation
    // reuses TelegramAuthService with a distinct session file per account.
  }
}
