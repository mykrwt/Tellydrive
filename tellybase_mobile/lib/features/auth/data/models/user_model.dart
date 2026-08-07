import 'package:tellybase_mobile/features/auth/domain/entities/app_user.dart';

class UserModel {
  const UserModel({
    required this.id,
    required this.name,
    required this.email,
    required this.createdAt,
    required this.isAdmin,
    required this.accountStatus,
    required this.subscriptionTier,
    required this.subscriptionStatus,
    required this.premiumActive,
    required this.storageEnabled,
    this.lastLoginAt,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final name = json['name'];
    final email = json['email'];
    final createdAt = json['createdAt'];
    if (id is! String ||
        name is! String ||
        email is! String ||
        createdAt is! String) {
      throw const FormatException('Invalid user response');
    }
    final lastLoginValue = json['lastLoginAt'];
    final subscription = json['subscription'];
    final subscriptionMap = subscription is Map<Object?, Object?> ? subscription : const <Object?, Object?>{};
    final entitlements = json['entitlements'];
    final entitlementMap = entitlements is Map<Object?, Object?> ? entitlements : const <Object?, Object?>{};
    return UserModel(
      id: id,
      name: name,
      email: email,
      createdAt: DateTime.parse(createdAt),
      lastLoginAt: lastLoginValue is String
          ? DateTime.tryParse(lastLoginValue)
          : null,
      isAdmin: json['isAdmin'] == true || json['role'] == 'admin',
      accountStatus: json['accountStatus'] is String ? json['accountStatus'] as String : 'active',
      subscriptionTier: subscriptionMap['tier'] is String ? subscriptionMap['tier'] as String : 'free',
      subscriptionStatus: subscriptionMap['status'] is String ? subscriptionMap['status'] as String : 'active',
      premiumActive: subscriptionMap['premiumActive'] == true,
      storageEnabled: entitlementMap['storage'] != false,
    );
  }

  final String accountStatus;
  final DateTime createdAt;
  final String email;
  final String id;
  final bool isAdmin;
  final DateTime? lastLoginAt;
  final String name;
  final bool premiumActive;
  final bool storageEnabled;
  final String subscriptionStatus;
  final String subscriptionTier;

  AppUser toEntity() => AppUser(
        id: id,
        name: name,
        email: email,
        createdAt: createdAt,
        lastLoginAt: lastLoginAt,
        isAdmin: isAdmin,
        accountStatus: accountStatus,
        subscriptionTier: subscriptionTier,
        subscriptionStatus: subscriptionStatus,
        premiumActive: premiumActive,
        storageEnabled: storageEnabled,
      );
}
