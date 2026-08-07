class AppUser {
  const AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.createdAt,
    required this.isAdmin,
    this.lastLoginAt,
    this.accountStatus = 'active',
    this.subscriptionTier = 'free',
    this.subscriptionStatus = 'active',
    this.premiumActive = false,
    this.storageEnabled = true,
  });

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

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}
