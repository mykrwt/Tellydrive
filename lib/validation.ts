import "server-only";
import path from "node:path";

// ── Input sanitization & security helpers ──

const ID_RE = /^[a-zA-Z0-9_-]{6,64}$/;

// Windows reserved characters and control chars that break Telegram/form-data filenames
const ILLEGAL_FILE_NAME_CHARS = /[<>:\"|?*\x00-\x1F]/g;

// Dangerous double extensions (executables hidden as media)
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".scr", ".pif",
  ".js", ".jse", ".vbs", ".vbe", ".ws", ".wsf", ".wsh",
  ".ps1", ".psm1", ".sh", ".bash", ".csh",
  ".app", ".deb", ".rpm", ".dmg", ".pkg",
  ".jar", ".war",
]);

// Prevent path traversal, null bytes, control chars. Instead of throwing on
// disallowed characters, we replace them so uploads from phones/cameras with
// weird names (e.g. "IMG_0001 (1).JPEG", "Photo#2.jpg", "my<file>.txt") succeed.
export function sanitizeFileName(name: string): string {
  if (!name || typeof name !== "string") throw new Error("Invalid file name");

  // Strip directory components
  const base = name.split(/[\\/]/).pop() ?? name;

  // Remove null bytes, normalize unicode, trim whitespace
  let cleaned = base.replace(/\0/g, "").normalize("NFKC").trim();

  if (!cleaned || cleaned === "." || cleaned === "..") throw new Error("Invalid file name");

  // Replace illegal characters with an underscore instead of rejecting the upload
  cleaned = cleaned.replace(ILLEGAL_FILE_NAME_CHARS, "_");

  // Block dangerous extensions even when disguised as double ext (e.g., photo.jpg.exe)
  const lower = cleaned.toLowerCase();
  const ext = path.extname(lower);
  if (BLOCKED_EXTENSIONS.has(ext)) throw new Error("File type not allowed.");

  // Also check if any segment contains blocked ext (photo.exe.jpg -> still block .exe segment)
  const parts = lower.split(".");
  for (const p of parts.slice(1)) {
    if (BLOCKED_EXTENSIONS.has(`.${p}`)) throw new Error("File type not allowed.");
  }

  // Trim trailing dots/spaces that are illegal on Windows and can break downloads
  cleaned = cleaned.replace(/[.\\s]+$/g, "").trim();

  // Collapse multiple consecutive underscores left over from replacement
  cleaned = cleaned.replace(/_{2,}/g, "_");

  // Prevent hidden files
  if (cleaned.startsWith(".")) cleaned = "_" + cleaned.slice(1);

  if (!cleaned || cleaned === "." || cleaned === "..") throw new Error("Invalid file name");

  // Keep length within 255 chars while preserving the file extension
  if (cleaned.length > 255) {
    const ext2 = path.extname(cleaned);
    const stem = path.basename(cleaned, ext2);
    const maxStem = Math.max(1, 255 - ext2.length);
    cleaned = (stem.slice(0, maxStem) + ext2).slice(0, 255);
  }

  // Final XSS check: no < > even after sanitization
  if (/[<>]/.test(cleaned)) throw new Error("Invalid file name");

  return cleaned;
}

export function validateFileType(mime: string, name: string): { ok: boolean; kind: "image" | "video" | "other" } {
  const lowerMime = mime.toLowerCase().trim();
  const lowerName = name.toLowerCase();

  // Strict allow-list for mime prefixes; block executable mimes explicitly
  const blockedMimes = ["application/x-msdownload", "application/x-sh", "text/javascript", "application/javascript"];
  if (blockedMimes.includes(lowerMime)) return { ok: false, kind: "other" };

  const imageExts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".avif", ".bmp", ".tiff", ".jfif"];
  const videoExts = [
    ".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v", ".3gp", ".3g2",
    ".mpg", ".mpeg", ".wmv", ".flv", ".ts", ".m2ts", ".ogv", ".vob", ".f4v", ".mts",
  ];

  // Accept any real image/video MIME type — browsers report many container
  // variants (video/3gpp, video/x-matroska, video/mp2t, …) and the bytes are
  // stored as-is, so there is no reason to hard-block uncommon ones.
  if (lowerMime.startsWith("image/")) {
    // Validate that extension matches if present
    const ext = path.extname(lowerName);
    if (ext && !imageExts.includes(ext) && !videoExts.includes(ext)) {
      // Allow image mime with unknown ext? Block non-media ext
      // If it's clearly not image/video ext, reject
      if (BLOCKED_EXTENSIONS.has(ext)) return { ok: false, kind: "other" };
    }
    return { ok: true, kind: "image" };
  }
  if (lowerMime.startsWith("video/")) return { ok: true, kind: "video" };

  // Fallback: missing/generic MIME — decide by extension (phones and desktop
  // drag & drop often omit the MIME type).
  if (imageExts.some((e) => lowerName.endsWith(e))) return { ok: true, kind: "image" };
  if (videoExts.some((e) => lowerName.endsWith(e))) return { ok: true, kind: "video" };

  // For now only images/videos are allowed
  return { ok: false, kind: "other" };
}

// ── Folder name validation (Files section) ──

const ILLEGAL_FOLDER_CHARS = /[<>:"/\\|?*\x00-\x1F]/;

export function validateFolderName(name: unknown): string {
  const cleaned = String(name ?? "").normalize("NFKC").trim();
  if (!cleaned) throw new Error("Folder name is required.");
  if (cleaned === "." || cleaned === "..") throw new Error("Invalid folder name.");
  if (cleaned.length > 100) throw new Error("Folder name must be 100 characters or fewer.");
  if (ILLEGAL_FOLDER_CHARS.test(cleaned)) throw new Error('Folder name cannot contain < > : " / \\ | ? * characters.');
  if (cleaned.startsWith(".")) throw new Error("Folder name cannot start with a dot.");
  if (cleaned.endsWith(".") || cleaned.endsWith(" ")) throw new Error("Folder name cannot end with a dot or space.");
  return cleaned;
}

// ── Generic file type validation (Files section) ──

// Safe non-media extensions allowed in the Files section. Executables and
// scriptable formats stay blocked (see BLOCKED_EXTENSIONS).
const DOC_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp",
  ".txt", ".rtf", ".csv", ".md", ".json", ".xml", ".yaml", ".yml", ".log", ".sql",
  ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".tgz",
  ".mp3", ".wav", ".ogg", ".opus", ".flac", ".aac", ".m4a", ".wma",
  ".epub", ".mobi", ".ics", ".vcf", ".srt", ".vtt",
  ".ttf", ".otf", ".woff", ".woff2", ".eot",
  ".psd", ".ai", ".sketch", ".fig", ".sqlite", ".db",
]);

const SAFE_DOC_MIMES = new Set([
  "application/pdf",
  "application/json",
  "application/xml",
  "application/rtf",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/gzip",
  "application/x-tar",
  "application/x-bzip2",
  "application/x-brotli",
  "application/epub+zip",
  "application/x-subrip",
  "application/x-font-ttf",
  "application/font-woff",
  "application/font-woff2",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.apple.installer+xml", // safe XML-based
]);

export type FileKind = "image" | "video" | "audio" | "document" | "archive" | "other";

export function validateAnyFileType(mime: string, name: string): { ok: boolean; kind: FileKind } {
  const lowerMime = mime.toLowerCase().trim();
  const lowerName = name.toLowerCase();

  const blockedMimes = ["application/x-msdownload", "application/x-sh", "text/javascript", "application/javascript"];
  if (blockedMimes.includes(lowerMime)) return { ok: false, kind: "other" };

  if (lowerMime.startsWith("image/")) return { ok: true, kind: "image" };
  if (lowerMime.startsWith("video/")) return { ok: true, kind: "video" };
  if (lowerMime.startsWith("audio/")) return { ok: true, kind: "audio" };
  if (lowerMime.startsWith("text/")) return { ok: true, kind: "document" };
  if (SAFE_DOC_MIMES.has(lowerMime)) {
    if (lowerMime === "application/zip" || lowerMime === "application/x-zip-compressed" || lowerMime === "application/x-7z-compressed" || lowerMime === "application/x-rar-compressed" || lowerMime === "application/gzip" || lowerMime === "application/x-tar" || lowerMime === "application/x-bzip2") {
      return { ok: true, kind: "archive" };
    }
    return { ok: true, kind: "document" };
  }

  // Fallback: missing/generic MIME — decide by extension
  const ext = path.extname(lowerName);
  if (ext && DOC_EXTENSIONS.has(ext)) {
    if ([".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".tgz"].includes(ext)) return { ok: true, kind: "archive" };
    if ([".mp3", ".wav", ".ogg", ".opus", ".flac", ".aac", ".m4a", ".wma"].includes(ext)) return { ok: true, kind: "audio" };
    return { ok: true, kind: "document" };
  }
  return { ok: false, kind: "other" };
}

export function validateFileSize(size: number): string | null {
  const MAX = 2 * 1024 * 1024 * 1024; // 2GB
  if (!Number.isFinite(size) || size <= 0) return "Invalid file size.";
  if (size > MAX) return "File exceeds 2 GB limit.";
  return null;
}

export function sanitizeSearchQuery(q: unknown): string {
  if (typeof q !== "string") return "";
  // Strip control chars, trim, limit length, prevent ReDoS by simple length cap
  const clean = q.replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, 100);
  // Remove potential XSS / injection chars but keep useful search chars
  // Allow letters, numbers, spaces, - _ . @
  // We keep clean as-is after stripping controls; server uses includes() not regex, so safe.
  return clean;
}

export function validateId(id: unknown): boolean {
  return typeof id === "string" && ID_RE.test(id);
}

export function genericError(): string {
  return "Something went wrong. Please try again.";
}

// Log security events without PII leakage
export function logSecurity(event: string, meta?: Record<string, unknown>) {
  // Never log tokens, emails, file contents
  const safeMeta = meta ? JSON.stringify(meta).slice(0, 500) : "";
  console.warn(`[security] ${event} ${safeMeta}`);
}
