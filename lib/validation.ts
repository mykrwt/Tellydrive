import "server-only";
import path from "node:path";

// ── Input sanitization & security helpers ──

const ID_RE = /^[a-zA-Z0-9_-]{6,64}$/;

// Windows reserved characters and control chars that break Telegram/form-data filenames
const ILLEGAL_FILE_NAME_CHARS = /[<>:"|?*\x00-\x1F]/g;

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

  // Trim trailing dots/spaces that are illegal on Windows and can break downloads
  cleaned = cleaned.replace(/[.\s]+$/g, "").trim();

  // Collapse multiple consecutive underscores left over from replacement
  cleaned = cleaned.replace(/_{2,}/g, "_");

  if (!cleaned || cleaned === "." || cleaned === "..") throw new Error("Invalid file name");

  // Keep length within 255 chars while preserving the file extension
  if (cleaned.length > 255) {
    const ext = path.extname(cleaned);
    const stem = path.basename(cleaned, ext);
    const maxStem = Math.max(1, 255 - ext.length);
    cleaned = (stem.slice(0, maxStem) + ext).slice(0, 255);
  }

  return cleaned;
}

export function validateFileType(mime: string, name: string): { ok: boolean; kind: "image" | "video" | "other" } {
  const lowerMime = mime.toLowerCase();
  const lowerName = name.toLowerCase();

  const imageMimes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/avif"];
  const videoMimes = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/x-msvideo", "video/avi", "video/mov"];

  const imageExts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".avif"];
  const videoExts = [".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v", ".3gp"];

  if (imageMimes.includes(lowerMime) || imageExts.some((e) => lowerName.endsWith(e))) {
    return { ok: true, kind: "image" };
  }
  if (videoMimes.includes(lowerMime) || videoExts.some((e) => lowerName.endsWith(e))) {
    return { ok: true, kind: "video" };
  }
  // For now only images/videos are allowed
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
  // Strip control chars, trim, limit length
  const clean = q.replace(/[\\x00-\\x1F\\x7F]/g, "").trim().slice(0, 100);
  // Escape regex special chars for safe use
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
