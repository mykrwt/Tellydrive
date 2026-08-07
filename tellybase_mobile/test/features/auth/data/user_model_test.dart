import 'package:flutter_test/flutter_test.dart';
import 'package:tellybase_mobile/features/auth/data/models/user_model.dart';

void main() {
  test('maps a safe API user into a domain entity', () {
    final user = UserModel.fromJson(const <String, dynamic>{
      'id': 'user_123456',
      'name': 'Ada Lovelace',
      'email': 'ada@example.com',
      'createdAt': '2026-08-07T10:00:00.000Z',
      'lastLoginAt': '2026-08-07T11:00:00.000Z',
      'role': 'admin',
      'isAdmin': true,
    }).toEntity();

    expect(user.name, 'Ada Lovelace');
    expect(user.initials, 'AL');
    expect(user.isAdmin, isTrue);
  });

  test('rejects incomplete user payloads', () {
    expect(
      () => UserModel.fromJson(const <String, dynamic>{'id': 'only-id'}),
      throwsFormatException,
    );
  });
}
