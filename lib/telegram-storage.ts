import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AccountStoreError } from "./telegram-store";
import { sanitizeFileName, validateAnyFileType, validateFileSize, validateFileType } from "./validation";
import {
  adminTelegramDatabaseMode,
  getAdminStorageTelegramConfig,
  getServerSessionSigningSecret,
} from "@/lib/server/admin-telegram-config";

// System A only. This module never accepts a user-provided Telegram token,
// channel ID, session, or API credential.

function databaseMode(): "telegram" | "local" | "unconfigured" {
  return adminTelegramDatabaseMode();
}

export function isTelegramEnabled(): boolean {
  const mode = databaseMode();
  if (mode === "telegram") return true;
  return false;
}

// ── Constants for chunking & optimization ──
// Telegram Bot API limits: uploads ≤ 50 MB (sendDocument), downloads via
// getFile ≤ 20 MB. Chunks must stay comfortably UNDER the 20 MB download
// limit or reassembly/downloads fail with FILE_DOWNLOAD_LIMIT_EXCEEDED, so
// we use 19 MB parts (also safely below the 50 MB upload limit).
export const CHUNK_SIZE = 19 * 1024 * 1024; // 19 MB
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB
export const MAX_RETRIES = 5;
export const INITIAL_BACKOFF_MS = 1000;
export const RATE_LIMIT_DELAY_MS = 350; // delay between Telegram requests

// Queue to serialize Telegram uploads and respect rate limits
let uploadQueue: Promise<unknown> = Promise.resolve();

function queued<T>(op: () => Promise<T>): Promise<T> {
  const result = uploadQueue.then(op, op);
  uploadQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (attempt >= MAX_RETRIES) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    // Retry only on transient errors
    const isTransient =
      msg.includes("Too Many Requests") ||
      msg.includes("timeout") ||
      msg.includes("network") ||
      msg.includes("ECONN") ||
      msg.includes("429") ||
      msg.includes("502") ||
      msg.includes("503");
    if (!isTransient && attempt > 1) throw err; // non-transient after a couple tries, bail
    const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 250;
    await sleep(backoff);
    return withRetry(fn, attempt + 1);
  }
}

// ── Telegram helpers ──
type TelegramResponse<T> = { ok: true; result: T } | { ok: false; description?: string };
type TelegramMessage = {
  message_id: number;
  document?: { file_id: string; file_name?: string; file_size?: number; mime_type?: string };
  video?: { file_id: string; file_name?: string; file_size?: number; mime_type?: string };
  photo?: Array<{ file_id: string }>;
};

async function telegramSendDocument(
  token: string,
  chatId: string,
  apiBase: string,
  blob: Blob,
  fileName: string,
  caption?: string
): Promise<{ fileId: string; messageId: number }> {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("document", blob, fileName);
  if (caption) form.append("caption", caption);

  // Rate limit delay
  await sleep(RATE_LIMIT_DELAY_MS);

  const response = await withRetry(async () => {
    const res = await fetch(`${apiBase}/bot${token}/sendDocument`, {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
    let payload: TelegramResponse<TelegramMessage>;
    try {
      payload = (await res.json()) as TelegramResponse<TelegramMessage>;
    } catch {
      throw new Error(`Invalid response from Telegram (HTTP ${res.status})`);
    }
    if (!res.ok || !payload.ok) {
      const detail = payload.ok ? `HTTP ${res.status}` : payload.description || `HTTP ${res.status}`;
      // Handle 429 with retry-after
      if (detail.includes("Too Many Requests") || res.status === 429) {
        const payloadWithParams = payload as unknown as { parameters?: { retry_after?: number } };
        const retryAfter = payloadWithParams.parameters?.retry_after;
        if (retryAfter) await sleep((retryAfter + 1) * 1000);
        throw new Error(`Too Many Requests: ${detail}`);
      }
      throw new Error(`Telegram sendDocument failed: ${detail}`);
    }
    return payload.result;
  });

  const fileId = response.document?.file_id || response.video?.file_id;
  if (!fileId) throw new Error("Telegram did not return a file id");
  return { fileId, messageId: response.message_id };
}

async function telegramGetFilePath(token: string, apiBase: string, fileId: string): Promise<string> {
  const res = await withRetry(async () => {
    const r = await fetch(`${apiBase}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`Telegram getFile failed (HTTP ${r.status})`);
    const p = (await r.json()) as TelegramResponse<{ file_path?: string }>;
    if (!p.ok) throw new Error(`Telegram getFile failed: ${p.description}`);
    if (!p.result.file_path) throw new Error("Telegram did not return file_path");
    return p.result.file_path;
  });
  return res;
}

// ── Local fallback (for dev without Telegram) ──
async function saveLocalBlob(blob: Blob): Promise<{ fileId: string; messageId: number }> {
  const id = randomUUID();
  const dest = path.join(process.cwd(), ".data", "files", id);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await blob.arrayBuffer()));
  return { fileId: `local:${id}`, messageId: 0 };
}

// ── Chunking ──
export type ChunkMeta = {
  order: number;
  messageId: number;
  fileId: string;
  size: number;
};

export type UploadResult = {
  fileId: string; // primary fileId (first chunk) or single fileId
  messageId: number;
  size: number;
  chunked: boolean;
  chunkCount?: number;
  chunks?: ChunkMeta[];
  chunkSize?: number;
};

function sliceBlob(blob: Blob, chunkSize: number): Blob[] {
  const chunks: Blob[] = [];
  let offset = 0;
  while (offset < blob.size) {
    chunks.push(blob.slice(offset, offset + chunkSize));
    offset += chunkSize;
  }
  return chunks;
}

/**
 * Upload a file to Telegram storage with automatic chunking.
 * - Images/single small videos: single sendDocument
 * - Large videos > CHUNK_SIZE: split into 20MB parts, upload sequentially, track order
 * - Implements queueing, exponential backoff, and rate limiting
 * - Invisible to user — caller gets a unified UploadResult
 */
export async function uploadToStorage(
  originalName: string,
  blob: Blob,
  opts?: {
    onProgress?: (uploaded: number, total: number, chunkIndex?: number) => void;
    // Allow any safe file type (documents, audio, archives…) — used by the Files
    // section and Admin uploads. Defaults to media-only for the Gallery.
    allowAny?: boolean;
  }
): Promise<UploadResult> {
  const name = sanitizeFileName(originalName);
  const sizeErr = validateFileSize(blob.size);
  if (sizeErr) throw new AccountStoreError(sizeErr);

  const { ok } = opts?.allowAny
    ? validateAnyFileType(blob.type || "application/octet-stream", name)
    : validateFileType(blob.type || "application/octet-stream", name);
  if (!ok) {
    throw new AccountStoreError(opts?.allowAny ? "This file type is not supported." : "Only images and videos are supported.");
  }

  // System A is the sole storage target. No client/user credential can
  // override this backend capability.
  const globalStorage = getAdminStorageTelegramConfig();
  const token = globalStorage.token;
  const chatId = globalStorage.chatId;
  const apiBase = globalStorage.apiBase;

  // Local fallback
  if (!token || !chatId) {
    if (databaseMode() === "local") {
      const local = await saveLocalBlob(blob);
      return {
        fileId: local.fileId,
        messageId: local.messageId,
        size: blob.size,
        chunked: false,
      };
    }
    throw new AccountStoreError("Storage is not configured. Contact support.");
  }

  // Small files or images: single upload via queue
  if (blob.size <= CHUNK_SIZE) {
    return queued(async () => {
      const { fileId, messageId } = await telegramSendDocument(token, chatId, apiBase, blob, name);
      opts?.onProgress?.(blob.size, blob.size, 0);
      return {
        fileId,
        messageId,
        size: blob.size,
        chunked: false,
      };
    });
  }

  // Large file: chunked upload
  const parts = sliceBlob(blob, CHUNK_SIZE);
  const chunks: ChunkMeta[] = [];

  // Sequential queue for chunks
  return queued(async () => {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const chunkName = `${name}.part${String(i + 1).padStart(3, "0")}of${String(parts.length).padStart(3, "0")}`;
      const { fileId, messageId } = await telegramSendDocument(
        token,
        chatId,
        apiBase,
        part,
        chunkName,
        `Chunk ${i + 1}/${parts.length} of ${name} (${part.size} bytes)`
      );
      chunks.push({ order: i, messageId, fileId, size: part.size });
      opts?.onProgress?.(chunks.reduce((a, c) => a + c.size, 0), blob.size, i);
      // Small delay already inside telegramSendDocument, but also ensure spacing
      if (i < parts.length - 1) await sleep(100);
    }

    // Use first chunk's fileId as primary, but store all chunks for reassembly
    return {
      fileId: chunks[0].fileId,
      messageId: chunks[0].messageId,
      size: blob.size,
      chunked: true,
      chunkCount: chunks.length,
      chunks,
      chunkSize: CHUNK_SIZE,
    };
  });
}

// ── Resolved file URL cache ──
// Every getFile call is a Telegram API round-trip with up to 15s worst-case
// latency, and before this cache every single thumbnail/preview/render paid
// it. Resolved download URLs stay valid for at least an hour, so cache them
// (with single-flight coalescing + LRU cap) and thumbnails become instant
// after the first view. Keys include the token so a token rotation can never
// hand out URLs signed with the old one.
const FILE_URL_TTL_MS = 50 * 60 * 1000; // 50 min (Telegram guarantees ≥ 1 h)
const FILE_URL_CACHE_MAX = 2000;
const fileUrlCache = new Map<string, { url: string; expiresAt: number }>();
const fileUrlPending = new Map<string, Promise<string>>();

function getCachedUrl(key: string): string | null {
  const hit = fileUrlCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    fileUrlCache.delete(key);
    return null;
  }
  // Refresh LRU position
  fileUrlCache.delete(key);
  fileUrlCache.set(key, hit);
  return hit.url;
}

function rememberUrl(key: string, url: string) {
  fileUrlCache.delete(key);
  fileUrlCache.set(key, { url, expiresAt: Date.now() + FILE_URL_TTL_MS });
  while (fileUrlCache.size > FILE_URL_CACHE_MAX) {
    const oldest = fileUrlCache.keys().next().value;
    if (oldest === undefined) break;
    fileUrlCache.delete(oldest);
  }
}

/** Run `fn` over `items` with a small worker pool (order preserved). */
async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => worker()));
  return results;
}

/**
 * Resolve a private System A upstream URL for backend fetches only.
 *
 * WARNING: a Telegram Bot API file URL embeds the bot token. Never serialize,
 * return, redirect to, or log this value. Public APIs must proxy the bytes.
 */
export async function resolvePrivateStorageFileUrl(fileId: string): Promise<string> {
  if (fileId.startsWith("local:")) {
    const id = fileId.slice(6);
    // Must be validated by the backend caller that the requesting user owns it.
    return `/api/local-file?id=${encodeURIComponent(id)}`;
  }
  const globalStorage = getAdminStorageTelegramConfig();
  const token = globalStorage.token;
  const apiBase = globalStorage.apiBase;
  if (!token) throw new AccountStoreError("Storage token missing.");

  const cacheKey = `${token}:${fileId}`;
  const cached = getCachedUrl(cacheKey);
  if (cached) return cached;

  const inFlight = fileUrlPending.get(cacheKey);
  if (inFlight) return inFlight;

  const pending = telegramGetFilePath(token, apiBase, fileId)
    .then((filePath) => {
      const url = `${apiBase}/file/bot${token}/${filePath}`;
      rememberUrl(cacheKey, url);
      return url;
    })
    .finally(() => {
      fileUrlPending.delete(cacheKey);
    });
  fileUrlPending.set(cacheKey, pending);
  return pending;
}

/** Resolve private chunk upstreams for backend reassembly only. */
export async function resolvePrivateChunkUrls(chunks: ChunkMeta[]): Promise<string[]> {
  const ordered = chunks.slice().sort((a, b) => a.order - b.order);
  return mapWithConcurrency(ordered, 6, (chunk) => resolvePrivateStorageFileUrl(chunk.fileId));
}

/**
 * Validate that a file should be accessible by a user (owner check helper)
 */
export function canAccessFile(ownerId: string, requesterId: string): boolean {
  return ownerId === requesterId;
}

/**
 * Send one already-sized part (< 5 MB) to storage as a Telegram document.
 * Used by the part-based upload flow so each browser request stays under
 * Vercel's 4.5 MB body limit. Returns the storage ids for that part.
 */
export async function sendPartToStorage(
  partName: string,
  blob: Blob,
  caption?: string
): Promise<{ fileId: string; messageId: number }> {
  const name = sanitizeFileName(partName);
  const globalStorage = getAdminStorageTelegramConfig();
  const token = globalStorage.token;
  const chatId = globalStorage.chatId;
  const apiBase = globalStorage.apiBase;

  // Local fallback (dev without Telegram)
  if (!token || !chatId) {
    if (databaseMode() === "local") {
      const local = await saveLocalBlob(blob);
      return { fileId: local.fileId, messageId: local.messageId };
    }
    throw new AccountStoreError("Storage is not configured. Contact support.");
  }

  return queued(async () => {
    const { fileId, messageId } = await telegramSendDocument(token, chatId, apiBase, blob, name, caption);
    return { fileId, messageId };
  });
}

// ── Sealed part tokens ──
// The client gets an authenticated-encrypted capability per part. Finalize
// accepts only capabilities this server issued, while Telegram storage IDs and
// message IDs remain confidential inside the System A boundary.

export type PartTokenPayload = {
  sub: string; // user id the part was uploaded by
  uploadId: string; // groups the parts of one file
  fileId: string;
  messageId: number;
  size: number;
  order: number;
  exp: number; // epoch seconds
};

function partTokenSecret(): string {
  return getServerSessionSigningSecret();
}

const PART_TOKEN_VERSION = 1;
const PART_TOKEN_IV_BYTES = 12;
const PART_TOKEN_TAG_BYTES = 16;
const PART_TOKEN_AAD = Buffer.from("tellybase:upload-part:v1", "utf8");

function partTokenKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

/**
 * Seal storage metadata with authenticated encryption before it crosses the
 * backend boundary. Unlike the former signed JSON format, clients cannot
 * decode Telegram file IDs, message IDs, or any other System A reference.
 */
export function signPartToken(payload: PartTokenPayload): string {
  const secret = partTokenSecret();
  if (!secret) throw new AccountStoreError("SESSION_SECRET is not configured.");
  const iv = randomBytes(PART_TOKEN_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", partTokenKey(secret), iv);
  cipher.setAAD(PART_TOKEN_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([
    Buffer.from([PART_TOKEN_VERSION]),
    iv,
    tag,
    ciphertext,
  ]).toString("base64url");
}

export function verifyPartToken(token: unknown): PartTokenPayload | null {
  if (typeof token !== "string" || !token) return null;
  const secret = partTokenSecret();
  if (!secret) return null;
  try {
    const sealed = Buffer.from(token, "base64url");
    const headerBytes = 1 + PART_TOKEN_IV_BYTES + PART_TOKEN_TAG_BYTES;
    if (sealed.length <= headerBytes || sealed[0] !== PART_TOKEN_VERSION) return null;
    const iv = sealed.subarray(1, 1 + PART_TOKEN_IV_BYTES);
    const tag = sealed.subarray(1 + PART_TOKEN_IV_BYTES, headerBytes);
    const ciphertext = sealed.subarray(headerBytes);
    const decipher = createDecipheriv("aes-256-gcm", partTokenKey(secret), iv);
    decipher.setAAD(PART_TOKEN_AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const payload = JSON.parse(plaintext) as PartTokenPayload;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.uploadId !== "string" ||
      typeof payload.fileId !== "string" ||
      typeof payload.messageId !== "number" ||
      typeof payload.size !== "number" ||
      typeof payload.order !== "number" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Map internal Telegram/storage failures to short, actionable messages that
 * are safe to show in the UI (no tokens, chat ids, or raw API details).
 */
export function friendlyStorageError(msg: string): string {
  const lower = msg.toLowerCase();
  if (
    lower.includes("too big") ||
    lower.includes("entity too large") ||
    lower.includes("request entity") ||
    lower.includes("file is too big")
  ) {
    return "The storage service rejected this file size. Try a smaller file.";
  }
  // Configuration, provider, channel, bot, URL, and permission details remain
  // in System A logs. Clients receive one provider-neutral failure message.
  return "Private storage is temporarily unavailable. Please try again.";
}
