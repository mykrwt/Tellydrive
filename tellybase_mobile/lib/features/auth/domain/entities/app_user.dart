class AppUser {
  const AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.createdAt,
    required this.isAdmin,
    this.lastLoginAt,
  });

  final DateTime createdAt;
  final String email;
  final String id;
  final bool isAdmin;
  final DateTime? lastLoginAt;
  final String name;

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}
