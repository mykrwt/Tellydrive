import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  adminTelegramDatabaseMode,
  getAdminAccountTelegramConfig,
} from "@/lib/server/admin-telegram-config";

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  lastLoginAt: string | null;
  // Role is assigned only by backend authorization policy.
  // A System B user Telegram identity can never grant or modify this field.
  role?: "admin" | "user";
};

// Future-ready extensible file type
export type ChunkMeta = {
  order: number;
  messageId: number;
  fileId: string;
  size: number;
};

export type StoredFile = {
  id: string;
  userId: string; // owner
  name: string;
  telegramFileId: string; // primary file_id (first chunk or single)
  telegramMessageId?: number; // message_id in storage channel
  size: number;
  mimeType: string;
  createdAt: string;
  updatedAt?: string;
  // Media metadata (for gallery)
  width?: number;
  height?: number;
  duration?: number;
  thumbnailFileId?: string;
  thumbnailMessageId?: number;
  // Chunking
  chunked?: boolean;
  chunkSize?: number;
  chunkCount?: number;
  chunks?: ChunkMeta[];
  // Folder / organization
  folderId?: string | null;
  albumIds?: string[];
  favorite?: boolean;
  tags?: string[];
  source?: "gallery" | "files" | "admin";
  // Access / trash
  trashed?: boolean;
  trashedAt?: string | null;
  // Versioning placeholder
  version?: number;
};

// Future types (not yet stored, but schema ready)
export type StoredFolder = {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  createdAt: string;
};

export type StoredAlbum = {
  id: string;
  userId: string;
  name: string;
  coverFileId?: string;
  fileIds: string[];
  createdAt: string;
};

type AuthDatabase = {
  version: 1;
  revision: number;
  updatedAt: string;
  users: StoredUser[];
  files: StoredFile[];
  folders: StoredFolder[];
  albums?: StoredAlbum[];
};

type TelegramResponse<T> = { ok: true; result: T } | { ok: false; description?: string };
type TelegramChat = { description?: string };
type TelegramFile = { file_path?: string };
type TelegramDocumentMessage = { document?: { file_id?: string }; message_id?: number };

const POINTER = /TBAUTH:([A-Za-z0-9_-]+)/;
const MAX_DATABASE_BYTES = 5 * 1024 * 1024;
const LEGACY_USER_CREDENTIALS_REMOVED = Symbol("legacy-user-credentials-removed");
type InternalAuthDatabase = AuthDatabase & { [LEGACY_USER_CREDENTIALS_REMOVED]?: boolean };
let queue: Promise<unknown> = Promise.resolve();

export class AccountStoreError extends Error {
  constructor(message: string, public readonly setupProblem = false) {
    super(message);
    this.name = "AccountStoreError";
  }
}

function emptyDatabase(): AuthDatabase {
  return {
    version: 1,
    revision: 0,
    updatedAt: new Date().toISOString(),
    users: [],
    files: [],
    folders: [],
    albums: [],
  };
}

function isStoredUser(value: unknown): value is StoredUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "string" &&
    typeof user.name === "string" &&
    typeof user.email === "string" &&
    typeof user.passwordHash === "string" &&
    typeof user.passwordSalt === "string" &&
    typeof user.createdAt === "string" &&
    (typeof user.lastLoginAt === "string" || user.lastLoginAt === null) &&
    (user.role === undefined || user.role === "admin" || user.role === "user")
  );
}

/**
 * Allow old records to load, but retain only the account fields used by the
 * application. This actively strips legacy per-user bot tokens/chat IDs so a
 * future database write cannot preserve credentials from the retired mixed
 * Telegram architecture.
 */
function isolateStoredUser(user: StoredUser): StoredUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    passwordHash: user.passwordHash,
    passwordSalt: user.passwordSalt,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    role: user.role,
  };
}

function isStoredFile(value: unknown): value is StoredFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  // Backward compat: only require core fields
  if (
    typeof file.id !== "string" ||
    typeof file.userId !== "string" ||
    typeof file.name !== "string" ||
    typeof file.telegramFileId !== "string" ||
    typeof file.size !== "number" ||
    typeof file.mimeType !== "string" ||
    typeof file.createdAt !== "string"
  )
    return false;
  // New optional fields are validated leniently
  return true;
}

function parseDatabase(raw: string): AuthDatabase {
  if (Buffer.byteLength(raw) > MAX_DATABASE_BYTES) {
    throw new AccountStoreError("The Telegram account database is too large.");
  }
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("Invalid database");
  const db = value as Partial<AuthDatabase>;
  if (db.version !== 1 || !Array.isArray(db.users) || !db.users.every(isStoredUser)) {
    throw new Error("Unsupported or damaged database");
  }
  const files = Array.isArray(db.files) ? db.files.filter(isStoredFile) : [];
  // Migrate old files to new schema defaults
  const migrated: StoredFile[] = files.map((f: unknown) => {
    const rec = f as Record<string, unknown>;
    return {
      ...(rec as StoredFile),
      updatedAt: (rec.updatedAt as string) ?? (rec.createdAt as string),
      chunked: Boolean(rec.chunked),
      chunkCount: (rec.chunkCount as number) ?? ((rec.chunks as unknown[]) ? (rec.chunks as unknown[]).length : undefined),
      folderId: (rec.folderId as string | null) ?? null,
      source: (rec.source as "gallery" | "files" | "admin" | undefined),
      favorite: Boolean(rec.favorite),
      trashed: Boolean(rec.trashed),
      version: (rec.version as number) ?? 1,
    };
  });
  const hadLegacyUserCredentials = db.users.some((user) => {
    const record = user as unknown as Record<string, unknown>;
    return Object.hasOwn(record, "telegramToken") || Object.hasOwn(record, "telegramChatId");
  });
  const parsed: InternalAuthDatabase = {
    version: 1,
    revision: Number.isInteger(db.revision) ? Number(db.revision) : 0,
    updatedAt: typeof db.updatedAt === "string" ? db.updatedAt : new Date().toISOString(),
    users: db.users.map(isolateStoredUser),
    files: migrated,
    folders: Array.isArray(db.folders) ? db.folders : [],
    albums: Array.isArray(db.albums) ? db.albums : [],
  };
  if (hadLegacyUserCredentials) {
    Object.defineProperty(parsed, LEGACY_USER_CREDENTIALS_REMOVED, { value: true });
  }
  return parsed;
}

export function databaseMode(): "telegram" | "local" | "unconfigured" {
  return adminTelegramDatabaseMode();
}

async function telegramApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const { token, apiBase } = getAdminAccountTelegramConfig();
  if (!token) throw new AccountStoreError("TELEGRAM_BOT_TOKEN is missing.", true);

  let response: Response;
  try {
    response = await fetch(`${apiBase}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network error";
    throw new AccountStoreError(`Could not connect to Telegram API (${msg}).`, true);
  }

  let payload: TelegramResponse<T>;
  try {
    payload = (await response.json()) as TelegramResponse<T>;
  } catch {
    throw new AccountStoreError(`Invalid JSON response from Telegram API for ${method} (HTTP ${response.status}).`, true);
  }

  if (!response.ok || !payload.ok) {
    const detail = payload.ok ? `HTTP ${response.status}` : payload.description || `HTTP ${response.status}`;
    if (method === "setChatDescription" && detail.toLowerCase().includes("not modified")) return {} as T;
    throw new AccountStoreError(`Telegram ${method} failed: ${detail}`, true);
  }
  return payload.result;
}

async function loadTelegram(): Promise<AuthDatabase> {
  const { token, chatId, apiBase } = getAdminAccountTelegramConfig();
  if (!chatId) throw new AccountStoreError("TELEGRAM_CHAT_ID is missing.", true);
  const chat = await telegramApi<TelegramChat>("getChat", { chat_id: chatId });
  const fileId = chat.description?.match(POINTER)?.[1];
  if (!fileId) return emptyDatabase();
  const file = await telegramApi<TelegramFile>("getFile", { file_id: fileId });
  if (!file.file_path) throw new AccountStoreError("Telegram did not return the database file path.", true);
  let response: Response;
  try {
    response = await fetch(`${apiBase}/file/bot${token}/${file.file_path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network error";
    throw new AccountStoreError(`Could not download database file from Telegram (${msg}).`, true);
  }
  if (!response.ok) throw new AccountStoreError(`Could not download database file from Telegram (HTTP ${response.status}).`, true);
  return parseDatabase(await response.text());
}

async function saveTelegram(database: AuthDatabase): Promise<void> {
  const { token, chatId, apiBase } = getAdminAccountTelegramConfig();
  if (!token || !chatId) throw new AccountStoreError("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing.", true);
  const serialized = JSON.stringify(database, null, 2);
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("document", new Blob([serialized], { type: "application/json" }), `tellydrive-auth-r${database.revision}.json`);
  form.append("caption", `TellyDrive auth database · revision ${database.revision}`);
  let response: Response;
  try {
    response = await fetch(`${apiBase}/bot${token}/sendDocument`, {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network error";
    throw new AccountStoreError(`Failed to upload database file to Telegram (${msg}).`, true);
  }
  let payload: TelegramResponse<TelegramDocumentMessage>;
  try {
    payload = (await response.json()) as TelegramResponse<TelegramDocumentMessage>;
  } catch {
    throw new AccountStoreError(`Invalid response from Telegram when uploading database (HTTP ${response.status}).`, true);
  }
  if (!response.ok || !payload.ok) {
    const detail = payload.ok ? `HTTP ${response.status}` : payload.description || `HTTP ${response.status}`;
    throw new AccountStoreError(`Telegram sendDocument failed: ${detail}`, true);
  }
  const fileId = payload.result.document?.file_id;
  if (!fileId) throw new AccountStoreError("Telegram did not return a file id for the uploaded database.", true);
  await telegramApi("setChatDescription", { chat_id: chatId, description: `TBAUTH:${fileId}` });
}

function localPath() {
  return path.join(process.cwd(), ".data", "auth.json");
}
async function loadLocal(): Promise<AuthDatabase> {
  try {
    return parseDatabase(await readFile(localPath(), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyDatabase();
    throw error;
  }
}
async function saveLocal(database: AuthDatabase): Promise<void> {
  const destination = localPath();
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(database, null, 2), { mode: 0o600 });
  await rename(temporary, destination);
}
// ── In-process database read cache ──
// A telegram-mode load() costs three round-trips (getChat → getFile →
// download JSON) and EVERY request needs the database (session lookup, file
// listing, each thumbnail…). Without a cache, a single page view triggers
// dozens of blocking downloads, all serialized behind one global queue.
// A short TTL + single-flight coalescing turns almost all reads into
// in-memory lookups. Writes go straight through and refresh the cache
// (write-through), so this process always sees its own changes instantly;
// other serverless instances may serve data up to DB_CACHE_TTL_MS stale —
// the same trade-off lib/api-cache already makes for query results.
const DB_CACHE_TTL_MS = 8_000;
let dbCache: { db: AuthDatabase; expiresAt: number } | null = null;
let dbLoadPromise: Promise<AuthDatabase> | null = null;

function loadUncached(): Promise<AuthDatabase> {
  const mode = databaseMode();
  if (mode === "telegram") return loadTelegram();
  if (mode === "local") return loadLocal();
  throw new AccountStoreError("Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable sign in.", true);
}

async function load(): Promise<AuthDatabase> {
  if (dbCache && dbCache.expiresAt > Date.now()) return dbCache.db;
  if (dbLoadPromise) return dbLoadPromise;
  dbLoadPromise = loadUncached()
    .then(async (db) => {
      const internal = db as InternalAuthDatabase;
      if (internal[LEGACY_USER_CREDENTIALS_REMOVED]) {
        // Fail closed: persist the scrubbed record before serving it so legacy
        // System B bot credentials cannot remain mixed into System A storage.
        db.revision += 1;
        db.updatedAt = new Date().toISOString();
        if (databaseMode() === "telegram") await saveTelegram(db);
        else await saveLocal(db);
      }
      dbCache = { db, expiresAt: Date.now() + DB_CACHE_TTL_MS };
      return db;
    })
    .finally(() => {
      dbLoadPromise = null;
    });
  return dbLoadPromise;
}
async function save(database: AuthDatabase): Promise<void> {
  try {
    if (databaseMode() === "telegram") await saveTelegram(database);
    else await saveLocal(database);
    // Write-through: keep the cached copy identical to what we persisted.
    dbCache = { db: database, expiresAt: Date.now() + DB_CACHE_TTL_MS };
  } catch (err) {
    // Never keep serving an in-memory version we failed to persist.
    dbCache = null;
    throw err;
  }
}
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation, operation);
  queue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  return serialized(async () => {
    const database = await load();
    return database.users.find((user) => user.email === email) ?? null;
  });
}
export async function findUserById(id: string): Promise<StoredUser | null> {
  return serialized(async () => {
    const database = await load();
    return database.users.find((user) => user.id === id) ?? null;
  });
}
export async function createUser(user: StoredUser): Promise<void> {
  return serialized(async () => {
    const database = await load();
    if (database.users.some((entry) => entry.email === user.email)) throw new AccountStoreError("An account with that email already exists.");
    database.users.push(user);
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
  });
}
export async function markLogin(id: string): Promise<void> {
  return serialized(async () => {
    const database = await load();
    const user = database.users.find((entry) => entry.id === id);
    if (!user) return;
    user.lastLoginAt = new Date().toISOString();
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
  });
}
// ── File operations with owner isolation ──

export type FileQuery = {
  search?: string;
  mime?: "image" | "video" | "all";
  source?: "gallery" | "files" | "admin";
  section?: "gallery" | "files" | "admin";
  excludeGallery?: boolean;
  sortBy?: "name" | "size" | "date";
  sortOrder?: "asc" | "desc";
  folderId?: string | null;
  favorite?: boolean;
  trashed?: boolean;
  limit?: number;
  offset?: number;
};

function applyFilters(files: StoredFile[], q: FileQuery): StoredFile[] {
  let out = files.slice();

  // Hide trashed by default
  const showTrashed = q.trashed === true;
  out = out.filter((f) => (showTrashed ? f.trashed : !f.trashed));

  // Section / source filtering
  if (q.section === "files" || q.excludeGallery) {
    // Exclude gallery items:
    // 1) Files explicitly marked as source: 'gallery'
    // 2) Files at root level with no folder and mimeType starting with image/ or video/, unless explicitly marked source: 'files'
    out = out.filter((f) => {
      if (f.source === "gallery") return false;
      if (f.source === "files") return true;
      if (f.folderId !== null && f.folderId !== undefined) return true;
      if (f.mimeType.startsWith("image/") || f.mimeType.startsWith("video/")) return false;
      return true;
    });
  } else if (q.section === "gallery") {
    out = out.filter((f) => {
      if (f.source === "gallery") return true;
      if (f.mimeType.startsWith("image/") || f.mimeType.startsWith("video/")) return true;
      return false;
    });
  }

  if (q.source) {
    out = out.filter((f) => f.source === q.source);
  }

  if (q.mime && q.mime !== "all") {
    out = out.filter((f) => {
      const isImage = f.mimeType.startsWith("image/");
      const isVideo = f.mimeType.startsWith("video/");
      return q.mime === "image" ? isImage : isVideo;
    });
  }
  if (q.folderId !== undefined) {
    out = out.filter((f) => (f.folderId ?? null) === q.folderId);
  }
  if (q.favorite) out = out.filter((f) => f.favorite);
  if (q.search) {
    const s = q.search.toLowerCase();
    out = out.filter((f) => f.name.toLowerCase().includes(s));
  }

  // Sort
  const sortBy = q.sortBy ?? "date";
  const order = q.sortOrder ?? "desc";
  out.sort((a, b) => {
    let cmp = 0;
    if (sortBy === "name") cmp = a.name.localeCompare(b.name);
    else if (sortBy === "size") cmp = a.size - b.size;
    else cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return order === "asc" ? cmp : -cmp;
  });
  return out;
}

export async function getFilesForUser(userId: string, query: FileQuery = {}): Promise<StoredFile[]> {
  return serialized(async () => {
    const database = await load();
    const owned = database.files.filter((file) => file.userId === userId);
    const filtered = applyFilters(owned, query);
    const limit = query.limit ?? filtered.length;
    const offset = query.offset ?? 0;
    return filtered.slice(offset, offset + limit);
  });
}

export async function getFilesPaginated(
  userId: string,
  query: FileQuery & { limit: number; offset: number }
): Promise<{ files: StoredFile[]; total: number }> {
  return serialized(async () => {
    const database = await load();
    const owned = database.files.filter((f) => f.userId === userId);
    const filtered = applyFilters(owned, query);
    const total = filtered.length;
    const slice = filtered.slice(query.offset, query.offset + query.limit);
    return { files: slice, total };
  });
}

export async function getFileById(userId: string, fileId: string, opts: { includeTrashed?: boolean } = {}): Promise<StoredFile | null> {
  return serialized(async () => {
    const database = await load();
    const file = database.files.find((f) => f.id === fileId && f.userId === userId) ?? null;
    if (!file) return null;
    if (file.trashed && !opts.includeTrashed) return null;
    return file;
  });
}

export async function countFilesForUser(userId: string): Promise<number> {
  return serialized(async () => {
    const database = await load();
    return database.files.filter((f) => f.userId === userId && !f.trashed).length;
  });
}

export async function addFile(file: StoredFile): Promise<void> {
  return serialized(async () => {
    const database = await load();
    database.files.push(file);
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
  });
}

export async function updateFile(userId: string, fileId: string, patch: Partial<StoredFile>): Promise<void> {
  return serialized(async () => {
    const database = await load();
    const idx = database.files.findIndex((f) => f.id === fileId && f.userId === userId);
    if (idx === -1) throw new AccountStoreError("File not found.");
    // Prevent owner hijacking
    const { userId: _uid, id: _id, ...safePatch } = patch;
    void _uid;
    void _id;
    database.files[idx] = { ...database.files[idx], ...safePatch, updatedAt: new Date().toISOString() } as StoredFile;
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
  });
}

export async function removeFile(fileId: string, userId: string): Promise<void> {
  return serialized(async () => {
    const database = await load();
    const index = database.files.findIndex((f) => f.id === fileId && f.userId === userId);
    if (index === -1) return;
    const file = database.files[index];
    if (file.telegramFileId.startsWith("local:")) {
      const localId = file.telegramFileId.slice(6);
      const filePath = path.join(process.cwd(), ".data", "files", localId);
      try {
        const { unlink } = await import("node:fs/promises");
        await unlink(filePath);
      } catch {}
      // Also clean chunks if chunked local (future)
      if (file.chunks) {
        for (const c of file.chunks) {
          if (c.fileId.startsWith("local:")) {
            const cid = c.fileId.slice(6);
            try {
              const { unlink } = await import("node:fs/promises");
              await unlink(path.join(process.cwd(), ".data", "files", cid));
            } catch {}
          }
        }
      }
    }
    // For now we hard delete; future: move to trash
    database.files.splice(index, 1);
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
  });
}

export async function moveFileToTrash(fileId: string, userId: string): Promise<void> {
  return serialized(async () => {
    const database = await load();
    const file = database.files.find((f) => f.id === fileId && f.userId === userId);
    if (!file) throw new AccountStoreError("File not found.");
    file.trashed = true;
    file.trashedAt = new Date().toISOString();
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
  });
}

// ── Folder operations (Files section) ──

export async function getFoldersForUser(userId: string, parentId?: string | null): Promise<StoredFolder[]> {
  return serialized(async () => {
    const database = await load();
    const owned = database.folders.filter((f) => f.userId === userId);
    if (parentId === undefined) return owned;
    return owned.filter((f) => (f.parentId ?? null) === parentId);
  });
}

export async function getFolderById(userId: string, folderId: string): Promise<StoredFolder | null> {
  return serialized(async () => {
    const database = await load();
    return database.folders.find((f) => f.id === folderId && f.userId === userId) ?? null;
  });
}

export async function getFolderPath(userId: string, folderId: string | null): Promise<StoredFolder[]> {
  return serialized(async () => {
    const database = await load();
    const owned = database.folders.filter((f) => f.userId === userId);
    const byId = new Map(owned.map((f) => [f.id, f]));
    const path: StoredFolder[] = [];
    let current = folderId ? byId.get(folderId) : undefined;
    while (current) {
      path.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return path;
  });
}

export async function createFolder(userId: string, name: string, parentId: string | null): Promise<StoredFolder> {
  const { validateFolderName } = await import("./validation");
  const safeName = validateFolderName(name);
  return serialized(async () => {
    const database = await load();
    if (parentId) {
      const parent = database.folders.find((f) => f.id === parentId && f.userId === userId);
      if (!parent) throw new AccountStoreError("Folder not found.");
    }
    const duplicate = database.folders.some(
      (f) => f.userId === userId && (f.parentId ?? null) === parentId && f.name.toLowerCase() === safeName.toLowerCase()
    );
    if (duplicate) throw new AccountStoreError("A folder with that name already exists here.");
    const folder: StoredFolder = {
      id: randomUUID(),
      userId,
      name: safeName,
      parentId,
      createdAt: new Date().toISOString(),
    };
    database.folders.push(folder);
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
    return folder;
  });
}

export async function renameFolder(userId: string, folderId: string, name: string): Promise<void> {
  const { validateFolderName } = await import("./validation");
  const safeName = validateFolderName(name);
  return serialized(async () => {
    const database = await load();
    const folder = database.folders.find((f) => f.id === folderId && f.userId === userId);
    if (!folder) throw new AccountStoreError("Folder not found.");
    const duplicate = database.folders.some(
      (f) => f.id !== folderId && f.userId === userId && (f.parentId ?? null) === (folder.parentId ?? null) && f.name.toLowerCase() === safeName.toLowerCase()
    );
    if (duplicate) throw new AccountStoreError("A folder with that name already exists here.");
    folder.name = safeName;
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
  });
}

export async function moveFolder(userId: string, folderId: string, newParentId: string | null): Promise<void> {
  return serialized(async () => {
    const database = await load();
    const folder = database.folders.find((f) => f.id === folderId && f.userId === userId);
    if (!folder) throw new AccountStoreError("Folder not found.");
    if ((folder.parentId ?? null) === newParentId) return;
    if (newParentId === folderId) throw new AccountStoreError("A folder cannot be moved inside itself.");
    if (newParentId) {
      const parent = database.folders.find((f) => f.id === newParentId && f.userId === userId);
      if (!parent) throw new AccountStoreError("Destination folder not found.");
      // Cycle detection: destination must not be the folder or one of its descendants
      let cursor: StoredFolder | undefined = parent;
      const seen = new Set<string>();
      while (cursor) {
        if (cursor.id === folderId) throw new AccountStoreError("A folder cannot be moved inside one of its subfolders.");
        if (seen.has(cursor.id)) break;
        seen.add(cursor.id);
        const pid: string | null = cursor.parentId;
        cursor = pid ? database.folders.find((f) => f.id === pid && f.userId === userId) : undefined;
      }
    }
    const duplicate = database.folders.some(
      (f) => f.id !== folderId && f.userId === userId && (f.parentId ?? null) === newParentId && f.name.toLowerCase() === folder.name.toLowerCase()
    );
    if (duplicate) throw new AccountStoreError("A folder with that name already exists at the destination.");
    folder.parentId = newParentId;
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
  });
}

export async function removeFolder(userId: string, folderId: string): Promise<{ movedFiles: number }> {
  return serialized(async () => {
    const database = await load();
    const folder = database.folders.find((f) => f.id === folderId && f.userId === userId);
    if (!folder) throw new AccountStoreError("Folder not found.");
    const parentId = folder.parentId;

    // Collect the folder and every descendant
    const doomed = new Set<string>([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of database.folders) {
        if (f.userId === userId && f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) {
          doomed.add(f.id);
          changed = true;
        }
      }
    }

    // Files inside deleted folders are moved up to the deleted folder's parent
    // (never destroyed) so nothing is lost.
    let movedFiles = 0;
    for (const file of database.files) {
      if (file.userId === userId && file.folderId && doomed.has(file.folderId)) {
        file.folderId = parentId;
        file.updatedAt = new Date().toISOString();
        movedFiles += 1;
      }
    }

    database.folders = database.folders.filter((f) => !doomed.has(f.id));
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
    return { movedFiles };
  });
}

// ── Admin overview ──

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user" | undefined;
  createdAt: string;
  lastLoginAt: string | null;
  fileCount: number;
  totalBytes: number;
};

export type AdminOverview = {
  mode: "telegram" | "local" | "unconfigured";
  revision: number;
  updatedAt: string;
  totals: { users: number; files: number; folders: number; bytes: number; images: number; videos: number; documents: number };
  users: AdminUserRow[];
};

export async function getAdminOverview(): Promise<AdminOverview> {
  return serialized(async () => {
    const database = await load();
    const totals = {
      users: database.users.length,
      files: database.files.length,
      folders: database.folders.length,
      bytes: database.files.reduce((sum, f) => sum + (f.size || 0), 0),
      images: database.files.filter((f) => f.mimeType.startsWith("image/")).length,
      videos: database.files.filter((f) => f.mimeType.startsWith("video/")).length,
      documents: database.files.filter((f) => !f.mimeType.startsWith("image/") && !f.mimeType.startsWith("video/")).length,
    };
    const users: AdminUserRow[] = database.users.map((u) => {
      const owned = database.files.filter((f) => f.userId === u.id);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        fileCount: owned.length,
        totalBytes: owned.reduce((sum, f) => sum + (f.size || 0), 0),
      };
    });
    users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return {
      mode: databaseMode(),
      revision: database.revision,
      updatedAt: database.updatedAt,
      totals,
      users,
    };
  });
}

export async function setUserRole(userId: string, role: "admin" | "user"): Promise<void> {
  return serialized(async () => {
    const database = await load();
    const user = database.users.find((u) => u.id === userId);
    if (!user) throw new AccountStoreError("User not found.");
    user.role = role;
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
  });
}
