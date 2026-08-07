import 'package:tellybase_mobile/features/auth/domain/entities/app_user.dart';

class UserModel {
  const UserModel({
    required this.id,
    required this.name,
    required this.email,
    required this.createdAt,
    required this.isAdmin,
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
    return UserModel(
      id: id,
      name: name,
      email: email,
      createdAt: DateTime.parse(createdAt),
      lastLoginAt: lastLoginValue is String
          ? DateTime.tryParse(lastLoginValue)
          : null,
      isAdmin: json['isAdmin'] == true || json['role'] == 'admin',
    );
  }

  final DateTime createdAt;
  final String email;
  final String id;
  final bool isAdmin;
  final DateTime? lastLoginAt;
  final String name;

  AppUser toEntity() => AppUser(
        id: id,
        name: name,
        email: email,
        createdAt: createdAt,
        lastLoginAt: lastLoginAt,
        isAdmin: isAdmin,
      );
}
