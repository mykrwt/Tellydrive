/// File identification helper for Tellybase.
///
/// Every file uploaded by this app is renamed to include a deterministic prefix
/// so the app can identify its own files after a reinstall without relying on
/// local databases or scanning file contents.
///
/// The prefix is stored in the Telegram file name itself, therefore it
/// survives app reinstalls, cache clears, and device migrations.
class FileIdentification {
  FileIdentification._();

  /// Deterministic prefix for all files created by this app.
  /// Must not be empty and should be unique enough to avoid collisions with
  /// user files. Changing this value would break discovery of older uploads,
  /// so treat it as a permanent identifier.
  static const String prefix = 'TLB_';

  /// Returns true if [fileName] was created by this app.
  static bool isOwnFile(String fileName) {
    if (fileName.isEmpty) return false;
    // Exact prefix match at the start; case-sensitive as Telegram preserves names.
    return fileName.startsWith(prefix);
  }

  /// Returns a storage name that includes the identification prefix.
  /// If [originalName] already contains the prefix it is returned unchanged
  /// to avoid double-prefixing on retries or renames.
  static String encode(String originalName) {
    final trimmed = originalName.trim();
    if (trimmed.isEmpty) return '${prefix}unnamed';
    if (isOwnFile(trimmed)) return trimmed;
    // Preserve directory separators? fileName should never contain path separators,
    // but we guard just in case.
    return '$prefix$trimmed';
  }

  /// Returns the user-visible name by stripping the prefix if present.
  static String decode(String storedName) {
    if (isOwnFile(storedName)) {
      return storedName.substring(prefix.length);
    }
    return storedName;
  }

  /// Visible display name (same as decode, but explicit for UI).
  static String displayName(String storedName) => decode(storedName);

  /// Checks a raw Telegram map for ownership without needing extra fetches.
  /// Fast path: only inspects fileName and caption.
  static bool isOwnFileMap(Map<String, dynamic> map) {
    final fileName = (map['fileName'] ?? map['name'] ?? '').toString();
    if (isOwnFile(fileName)) return true;
    // Fallback for chunked uploads: captions contain chunk metadata which is
    // also an app-specific identifier. This covers legacy files uploaded
    // before the prefix was introduced.
    final caption = (map['caption'] ?? '').toString();
    if (caption.startsWith('TELEDRIVE_CHUNK_V1:')) return true;
    return false;
  }
}
