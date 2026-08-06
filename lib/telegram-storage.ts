import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AccountStoreError } from "./telegram-store";
import { sanitizeFileName, validateFileSize, validateFileType } from "./validation";

// ── Configuration ──
// Channel 1: Auth DB uses TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
// Channel 2: Storage uses TELEGRAM_STORAGE_CHAT_ID (fallback to TELEGRAM_CHAT_ID) with same token
// Future: support separate TELEGRAM_STORAGE_BOT_TOKEN if needed

function authConfig() {
  let token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  if (token.startsWith("bot")) token = token.slice(3);
  token = token.replace(/^[\"']|[\"']$/g, "").trim();
  let chatId = process.env.TELEGRAM_CHAT_ID?.trim() ?? "";
  chatId = chatId.replace(/^[\"']|[\"']$/g, "").trim();
  return {
    token,
    chatId,
    apiBase: (process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/$/, ""),
  };
}

export function storageConfig() {
  const auth = authConfig();
  let storageChatId = process.env.TELEGRAM_STORAGE_CHAT_ID?.trim() ?? "";
  storageChatId = storageChatId.replace(/^[\"']|[\"']$/g, "").trim();
  const storageTokenRaw = process.env.TELEGRAM_STORAGE_BOT_TOKEN?.trim() ?? "";
  let storageToken = storageTokenRaw;
  if (storageToken.startsWith("bot")) storageToken = storageToken.slice(3);
  storageToken = storageToken.replace(/^[\"']|[\"']$/g, "").trim();

  return {
    token: storageToken || auth.token,
    chatId: storageChatId || auth.chatId,
    apiBase: auth.apiBase,
    isSeparateChannel: Boolean(storageChatId),
  };
}

export function databaseMode(): "telegram" | "local" | "unconfigured" {
  const { token, chatId } = authConfig();
  if (token && chatId) return "telegram";
  return process.env.NODE_ENV === "production" ? "unconfigured" : "local";
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
    userToken?: string;
    userChatId?: string;
    onProgress?: (uploaded: number, total: number, chunkIndex?: number) => void;
  }
): Promise<UploadResult> {
  const name = sanitizeFileName(originalName);
  const sizeErr = validateFileSize(blob.size);
  if (sizeErr) throw new AccountStoreError(sizeErr);

  const { ok } = validateFileType(blob.type || "application/octet-stream", name);
  if (!ok) throw new AccountStoreError("Only images and videos are supported.");

  // For now we allow all image/video types; future: documents etc.

  // Determine storage target
  const globalStorage = storageConfig();
  const token = opts?.userToken || globalStorage.token;
  const chatId = opts?.userChatId || globalStorage.chatId;
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

/**
 * Get a direct Telegram file URL (or local URL) for a file.
 * Handles chunked files by returning URL for a specific chunk or manifest.
 * For chunked files, caller should fetch all chunks and reassemble.
 */
export async function getStorageFileUrl(
  fileId: string,
  tokenOverride?: string
): Promise<string> {
  if (fileId.startsWith("local:")) {
    const id = fileId.slice(6);
    // Must be validated by caller that user owns file
    return `/api/local-file?id=${encodeURIComponent(id)}`;
  }
  const globalStorage = storageConfig();
  const token = tokenOverride || globalStorage.token;
  const apiBase = globalStorage.apiBase;
  if (!token) throw new AccountStoreError("Storage token missing.");

  const filePath = await telegramGetFilePath(token, apiBase, fileId);
  return `${apiBase}/file/bot${token}/${filePath}`;
}

/**
 * Get URLs for all chunks of a chunked file (for reassembly/streaming)
 */
export async function getChunkUrls(chunks: ChunkMeta[], tokenOverride?: string): Promise<string[]> {
  const urls: string[] = [];
  for (const c of chunks.sort((a, b) => a.order - b.order)) {
    urls.push(await getStorageFileUrl(c.fileId, tokenOverride));
  }
  return urls;
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
  const globalStorage = storageConfig();
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

// ── Signed part tokens ──
// The browser uploads parts individually and gets back an opaque signed token
// per part; finalize only accepts tokens this server issued. This prevents
// referencing arbitrary Telegram file_ids the user does not own.

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
  return (
    process.env.SESSION_SECRET ||
    process.env.TELEGRAM_BOT_TOKEN ||
    (process.env.NODE_ENV !== "production" ? "tellybase-local-development-session-key" : "")
  );
}

export function signPartToken(payload: PartTokenPayload): string {
  const secret = partTokenSecret();
  if (!secret) throw new AccountStoreError("SESSION_SECRET is not configured.");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyPartToken(token: unknown): PartTokenPayload | null {
  if (typeof token !== "string" || !token) return null;
  const secret = partTokenSecret();
  if (!secret) return null;
  try {
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) return null;
    const actual = Buffer.from(signature, "base64url");
    const expected = Buffer.from(createHmac("sha256", secret).update(encoded).digest("base64url"), "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PartTokenPayload;
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
  if (lower.includes("chat not found")) {
    return "Storage channel not found. Check the channel ID and make sure the bot was added to the channel.";
  }
  if (
    lower.includes("not enough rights") ||
    lower.includes("forbidden") ||
    lower.includes("bot is not a member") ||
    lower.includes("no rights")
  ) {
    return "The bot can't post in the storage channel. Make it an admin with “Post Messages” permission.";
  }
  if (
    lower.includes("too big") ||
    lower.includes("entity too large") ||
    lower.includes("request entity") ||
    lower.includes("file is too big")
  ) {
    return "This file is larger than Telegram accepts. Try a smaller file.";
  }
  if (lower.includes("timeout") || lower.includes("network") || lower.includes("econn")) {
    return "Could not reach Telegram storage right now. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}
