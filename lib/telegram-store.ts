import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  adminTelegramDatabaseMode,
  getAdminAccountTelegramConfig,
} from "@/lib/server/admin-telegram-config";

export type AccountStatus = "active" | "suspended" | "banned";
export type SubscriptionTier = "free" | "premium";
export type SubscriptionStatus = "active" | "inactive" | "past_due" | "cancelled";
export type StorageAccess = "enabled" | "disabled";

export type StoredSubscription = {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  expiresAt?: string | null;
  updatedAt: string;
};

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  lastLoginAt: string | null;
  // Every authority field is written and interpreted by the backend only.
  role?: "admin" | "user";
  accountStatus?: AccountStatus;
  subscription?: StoredSubscription;
  storageAccess?: StorageAccess;
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

export type MaintenanceState = {
  enabled: boolean;
  message: string | null;
  updatedAt: string | null;
};

export type SystemAuthorityState = {
  maintenance: MaintenanceState;
};

// ── Admin console domain (System A, backend-owned) ──

export type AppReleaseStatus = "draft" | "published" | "archived";

export type AppRelease = {
  id: string;
  fileName: string;
  size: number;
  versionName: string;
  versionCode: number;
  notes: string | null;
  sha256: string;
  status: AppReleaseStatus;
  createdAt: string;
  publishedAt: string | null;
  // System A storage references — never serialized to clients.
  storageFileId: string;
  storageMessageId: number;
  storageChunked?: boolean;
  storageChunks?: ChunkMeta[];
  storageChunkSize?: number;
};

export type Announcement = {
  message: string;
  updatedAt: string;
};

export type ActivityEntry = {
  id: string;
  at: string;
  actor: string; // "system" | "telegram:<id>" | "user:<id>" | "admin:<id>"
  action: string; // namespaced, e.g. "user.ban", "release.publish"
  target: string | null; // resource reference (email, user id, release id…)
  detail: string | null; // short human-readable detail
};

export type AdminAnalytics = {
  totals: {
    users: number;
    files: number;
    folders: number;
    bytes: number;
    images: number;
    videos: number;
    documents: number;
    imagesBytes: number;
    videosBytes: number;
    documentsBytes: number;
  };
  admins: number;
  banned: number;
  suspended: number;
  premiumActive: number;
  newUsers7d: number;
  newUsers30d: number;
  logins7d: number;
  logins30d: number;
  uploads7d: number;
  uploads30d: number;
  signupsPerDay: Array<{ day: string; count: number }>;
  topUsers: Array<{ id: string; name: string; email: string; bytes: number; fileCount: number }>;
  publishedRelease: { versionName: string; versionCode: number; publishedAt: string } | null;
  recentActivity: ActivityEntry[];
};

type AuthDatabase = {
  version: 1;
  revision: number;
  updatedAt: string;
  users: StoredUser[];
  files: StoredFile[];
  folders: StoredFolder[];
  albums?: StoredAlbum[];
  system?: SystemAuthorityState;
  releases?: AppRelease[];
  announcements?: Announcement[];
  activityLog?: ActivityEntry[];
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

function defaultSystemAuthorityState(): SystemAuthorityState {
  return {
    maintenance: { enabled: false, message: null, updatedAt: null },
  };
}

const ACTIVITY_LOG_MAX = 500;

function emptyDatabase(): AuthDatabase {
  return {
    version: 1,
    revision: 0,
    updatedAt: new Date().toISOString(),
    users: [],
    files: [],
    folders: [],
    albums: [],
    system: defaultSystemAuthorityState(),
    releases: [],
    announcements: [],
    activityLog: [],
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
    (user.role === undefined || user.role === "admin" || user.role === "user") &&
    (user.accountStatus === undefined || ["active", "suspended", "banned"].includes(String(user.accountStatus))) &&
    (user.storageAccess === undefined || user.storageAccess === "enabled" || user.storageAccess === "disabled") &&
    (user.subscription === undefined || (typeof user.subscription === "object" && user.subscription !== null))
  );
}

/**
 * Allow old records to load, but retain only the account fields used by the
 * application. This actively strips legacy per-user bot tokens/chat IDs so a
 * future database write cannot preserve credentials from the retired mixed
 * Telegram architecture.
 */
function normalizeSubscription(value: StoredUser["subscription"], fallbackDate: string): StoredSubscription {
  const tier: SubscriptionTier = value?.tier === "premium" ? "premium" : "free";
  const status: SubscriptionStatus = ["active", "inactive", "past_due", "cancelled"].includes(String(value?.status))
    ? (value?.status as SubscriptionStatus)
    : tier === "free"
      ? "active"
      : "inactive";
  return {
    tier,
    status,
    expiresAt: typeof value?.expiresAt === "string" || value?.expiresAt === null ? value.expiresAt : null,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : fallbackDate,
  };
}

function isolateStoredUser(user: StoredUser): StoredUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    passwordHash: user.passwordHash,
    passwordSalt: user.passwordSalt,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    role: user.role === "admin" ? "admin" : "user",
    accountStatus: ["active", "suspended", "banned"].includes(String(user.accountStatus))
      ? user.accountStatus
      : "active",
    subscription: normalizeSubscription(user.subscription, user.createdAt),
    storageAccess: user.storageAccess === "disabled" ? "disabled" : "enabled",
  };
}

function normalizeSystemAuthorityState(value: unknown): SystemAuthorityState {
  if (!value || typeof value !== "object") return defaultSystemAuthorityState();
  const system = value as { maintenance?: unknown };
  if (!system.maintenance || typeof system.maintenance !== "object") return defaultSystemAuthorityState();
  const maintenance = system.maintenance as Record<string, unknown>;
  return {
    maintenance: {
      enabled: maintenance.enabled === true,
      message: typeof maintenance.message === "string" ? maintenance.message.trim().slice(0, 240) || null : null,
      updatedAt: typeof maintenance.updatedAt === "string" ? maintenance.updatedAt : null,
    },
  };
}

function isAppRelease(value: unknown): value is AppRelease {
  if (!value || typeof value !== "object") return false;
  const release = value as Record<string, unknown>;
  return (
    typeof release.id === "string" &&
    typeof release.fileName === "string" &&
    typeof release.size === "number" &&
    typeof release.versionName === "string" &&
    typeof release.versionCode === "number" &&
    (release.notes === null || typeof release.notes === "string") &&
    typeof release.sha256 === "string" &&
    ["draft", "published", "archived"].includes(String(release.status)) &&
    typeof release.createdAt === "string" &&
    (release.publishedAt === null || typeof release.publishedAt === "string") &&
    typeof release.storageFileId === "string" &&
    typeof release.storageMessageId === "number"
  );
}

function isAnnouncement(value: unknown): value is Announcement {
  if (!value || typeof value !== "object") return false;
  const announcement = value as Record<string, unknown>;
  return typeof announcement.message === "string" && typeof announcement.updatedAt === "string";
}

function isActivityEntry(value: unknown): value is ActivityEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.at === "string" &&
    typeof entry.actor === "string" &&
    typeof entry.action === "string" &&
    (entry.target === null || typeof entry.target === "string") &&
    (entry.detail === null || typeof entry.detail === "string")
  );
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
    system: normalizeSystemAuthorityState(db.system),
    releases: Array.isArray(db.releases) ? db.releases.filter(isAppRelease) : [],
    announcements: Array.isArray(db.announcements) ? db.announcements.filter(isAnnouncement) : [],
    activityLog: Array.isArray(db.activityLog)
      ? db.activityLog.filter(isActivityEntry).slice(-ACTIVITY_LOG_MAX)
      : [],
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
function pushActivity(
  database: AuthDatabase,
  entry: { actor: string; action: string; target?: string | null; detail?: string | null },
): void {
  const now = new Date().toISOString();
  database.activityLog = database.activityLog ?? [];
  database.activityLog.push({
    id: randomUUID(),
    at: now,
    actor: entry.actor ?? "system",
    action: entry.action,
    target: entry.target ?? null,
    detail: entry.detail ? String(entry.detail).slice(0, 240) : null,
  });
  // Keep the audit trail bounded.
  if (database.activityLog.length > ACTIVITY_LOG_MAX) {
    database.activityLog = database.activityLog.slice(-ACTIVITY_LOG_MAX);
  }
}

export async function createUser(user: StoredUser): Promise<void> {
  return serialized(async () => {
    const database = await load();
    if (database.users.some((entry) => entry.email === user.email)) throw new AccountStoreError("An account with that email already exists.");
    database.users.push(user);
    pushActivity(database, { actor: "system", action: "user.signup", target: user.email });
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
    pushActivity(database, { actor: `user:${id}`, action: "auth.login", target: user.email });
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
    pushActivity(database, {
      actor: `user:${file.userId}`,
      action: "file.upload",
      target: file.id,
      detail: file.name.slice(0, 80),
    });
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

// ── Backend authority state ──

export async function getSystemAuthorityState(): Promise<SystemAuthorityState> {
  return serialized(async () => {
    const database = await load();
    return normalizeSystemAuthorityState(database.system);
  });
}

export async function setMaintenanceState(
  enabled: boolean,
  message: string | null,
  actor = "system",
): Promise<SystemAuthorityState> {
  return serialized(async () => {
    const database = await load();
    const next: SystemAuthorityState = {
      maintenance: {
        enabled,
        message: typeof message === "string" ? message.trim().slice(0, 240) || null : null,
        updatedAt: new Date().toISOString(),
      },
    };
    database.system = next;
    pushActivity(database, {
      actor,
      action: enabled ? "system.maintenance_on" : "system.maintenance_off",
      detail: next.maintenance.message ?? undefined,
    });
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
    return next;
  });
}

export type UserAuthorityPatch = {
  accountStatus?: AccountStatus;
  storageAccess?: StorageAccess;
  subscription?: {
    tier: SubscriptionTier;
    status: SubscriptionStatus;
    expiresAt?: string | null;
  };
};

export async function updateUserAuthorityPolicy(
  userId: string,
  patch: UserAuthorityPatch,
  actor = "system",
): Promise<void> {
  return serialized(async () => {
    const database = await load();
    const user = database.users.find((entry) => entry.id === userId);
    if (!user) throw new AccountStoreError("User not found.");
    const now = new Date().toISOString();
    if (patch.accountStatus) user.accountStatus = patch.accountStatus;
    if (patch.storageAccess) user.storageAccess = patch.storageAccess;
    if (patch.subscription) {
      user.subscription = {
        tier: patch.subscription.tier,
        status: patch.subscription.status,
        expiresAt: patch.subscription.expiresAt ?? null,
        updatedAt: now,
      };
    }
    const changed: string[] = [];
    if (patch.accountStatus) changed.push(`account=${patch.accountStatus}`);
    if (patch.storageAccess) changed.push(`storage=${patch.storageAccess}`);
    if (patch.subscription) changed.push(`plan=${patch.subscription.tier}/${patch.subscription.status}`);
    if (changed.length) {
      pushActivity(database, {
        actor,
        action: "user.policy",
        target: user.email,
        detail: changed.join(" "),
      });
    }
    database.revision += 1;
    database.updatedAt = now;
    await save(database);
  });
}

// ── Admin overview ──

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user" | undefined;
  accountStatus: AccountStatus;
  storageAccess: StorageAccess;
  subscription: StoredSubscription;
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
  system: SystemAuthorityState;
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
        accountStatus: u.accountStatus ?? "active",
        storageAccess: u.storageAccess ?? "enabled",
        subscription: normalizeSubscription(u.subscription, u.createdAt),
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
      system: normalizeSystemAuthorityState(database.system),
      users,
    };
  });
}

export async function setUserRole(userId: string, role: "admin" | "user", actor = "system"): Promise<void> {
  return serialized(async () => {
    const database = await load();
    const user = database.users.find((u) => u.id === userId);
    if (!user) throw new AccountStoreError("User not found.");
    user.role = role;
    pushActivity(database, {
      actor,
      action: role === "admin" ? "user.make_admin" : "user.remove_admin",
      target: user.email,
    });
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
  });
}

// ── Admin console: releases (APK versions) ──

export type NewAppRelease = {
  fileName: string;
  size: number;
  versionName: string;
  versionCode: number;
  notes: string | null;
  sha256: string;
  storageFileId: string;
  storageMessageId: number;
  storageChunked?: boolean;
  storageChunks?: ChunkMeta[];
  storageChunkSize?: number;
};

export async function addRelease(input: NewAppRelease, actor = "system"): Promise<AppRelease> {
  return serialized(async () => {
    const database = await load();
    const now = new Date().toISOString();
    const release: AppRelease = {
      id: randomUUID(),
      fileName: input.fileName,
      size: input.size,
      versionName: input.versionName,
      versionCode: input.versionCode,
      notes: input.notes ?? null,
      sha256: input.sha256,
      status: "draft",
      createdAt: now,
      publishedAt: null,
      storageFileId: input.storageFileId,
      storageMessageId: input.storageMessageId,
      storageChunked: input.storageChunked,
      storageChunks: input.storageChunks,
      storageChunkSize: input.storageChunkSize,
    };
    database.releases = database.releases ?? [];
    database.releases.push(release);
    pushActivity(database, {
      actor,
      action: "release.upload",
      target: release.id,
      detail: `${release.fileName} v${release.versionName} (code ${release.versionCode})`,
    });
    database.revision += 1;
    database.updatedAt = now;
    await save(database);
    return release;
  });
}

export async function getReleases(limit = 20): Promise<AppRelease[]> {
  return serialized(async () => {
    const database = await load();
    return (database.releases ?? [])
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  });
}

export async function getReleaseById(id: string): Promise<AppRelease | null> {
  return serialized(async () => {
    const database = await load();
    return database.releases?.find((release) => release.id === id) ?? null;
  });
}

export async function getLatestPublishedRelease(): Promise<AppRelease | null> {
  return serialized(async () => {
    const database = await load();
    const published = (database.releases ?? []).filter((release) => release.status === "published");
    if (!published.length) return null;
    return published.sort((a, b) => b.versionCode - a.versionCode)[0];
  });
}

export async function updateReleaseDetails(
  id: string,
  patch: { versionName?: string; versionCode?: number; notes?: string | null },
  actor = "system",
): Promise<AppRelease> {
  return serialized(async () => {
    const database = await load();
    const release = database.releases?.find((entry) => entry.id === id);
    if (!release) throw new AccountStoreError("Release not found.");
    const now = new Date().toISOString();
    const name = patch.versionName === undefined ? release.versionName : patch.versionName.trim().slice(0, 40);
    const code = patch.versionCode === undefined ? release.versionCode : patch.versionCode;
    if (!name) throw new AccountStoreError("Version name cannot be empty.");
    if (!Number.isInteger(code) || code < 0) throw new AccountStoreError("Version code must be a non-negative integer.");
    release.versionName = name;
    release.versionCode = code;
    if (patch.notes !== undefined) {
      release.notes = typeof patch.notes === "string" ? patch.notes.trim().slice(0, 500) || null : null;
    }
    pushActivity(database, {
      actor,
      action: "release.update",
      target: release.id,
      detail: `${release.fileName} v${release.versionName} (code ${release.versionCode})`,
    });
    database.revision += 1;
    database.updatedAt = now;
    await save(database);
    return release;
  });
}

export async function publishRelease(id: string, publish: boolean, actor = "system"): Promise<AppRelease> {
  return serialized(async () => {
    const database = await load();
    const release = database.releases?.find((entry) => entry.id === id);
    if (!release) throw new AccountStoreError("Release not found.");
    const now = new Date().toISOString();
    if (publish) {
      // Only one release is live at a time; publishing retires the previous one.
      for (const entry of database.releases ?? []) {
        if (entry.id !== id && entry.status === "published") entry.status = "archived";
      }
      release.status = "published";
      release.publishedAt = now;
      pushActivity(database, {
        actor,
        action: "release.publish",
        target: release.id,
        detail: `v${release.versionName} (code ${release.versionCode})`,
      });
    } else {
      release.status = "draft";
      release.publishedAt = null;
      pushActivity(database, {
        actor,
        action: "release.unpublish",
        target: release.id,
        detail: `v${release.versionName} (code ${release.versionCode})`,
      });
    }
    database.revision += 1;
    database.updatedAt = now;
    await save(database);
    return release;
  });
}

export async function deleteRelease(id: string, actor = "system"): Promise<void> {
  return serialized(async () => {
    const database = await load();
    const release = database.releases?.find((entry) => entry.id === id);
    if (!release) throw new AccountStoreError("Release not found.");
    database.releases = (database.releases ?? []).filter((entry) => entry.id !== id);
    pushActivity(database, {
      actor,
      action: "release.delete",
      target: release.id,
      detail: `${release.fileName} v${release.versionName}`,
    });
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
  });
}

// ── Admin console: announcements ──

export async function setAnnouncement(message: string, actor = "system"): Promise<Announcement> {
  return serialized(async () => {
    const database = await load();
    const now = new Date().toISOString();
    const cleaned = message.trim().slice(0, 1000);
    if (!cleaned) throw new AccountStoreError("Announcement cannot be empty.");
    database.announcements = [{ message: cleaned, updatedAt: now }];
    pushActivity(database, { actor, action: "announcement.set", detail: cleaned.slice(0, 120) });
    database.revision += 1;
    database.updatedAt = now;
    await save(database);
    return { message: cleaned, updatedAt: now };
  });
}

export async function clearAnnouncement(actor = "system"): Promise<void> {
  return serialized(async () => {
    const database = await load();
    database.announcements = [];
    pushActivity(database, { actor, action: "announcement.clear" });
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
  });
}

export async function getAnnouncement(): Promise<Announcement | null> {
  return serialized(async () => {
    const database = await load();
    const list = database.announcements ?? [];
    return list.length ? list[list.length - 1] : null;
  });
}

// ── Admin console: activity log ──

export async function getActivityLog(limit = 50): Promise<ActivityEntry[]> {
  return serialized(async () => {
    const database = await load();
    return (database.activityLog ?? [])
      .slice()
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, Math.max(1, Math.min(limit, ACTIVITY_LOG_MAX)));
  });
}

export async function recordActivity(entry: Omit<ActivityEntry, "id" | "at">): Promise<void> {
  return serialized(async () => {
    const database = await load();
    pushActivity(database, entry);
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
  });
}

// ── Admin console: analytics ──

function startOfDayUtc(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  return serialized(async () => {
    const database = await load();
    const now = Date.now();
    const day7 = now - 7 * 24 * 60 * 60 * 1000;
    const day30 = now - 30 * 24 * 60 * 60 * 1000;

    const totals = {
      users: database.users.length,
      files: database.files.length,
      folders: database.folders.length,
      bytes: database.files.reduce((sum, f) => sum + (f.size || 0), 0),
      images: 0,
      videos: 0,
      documents: 0,
      imagesBytes: 0,
      videosBytes: 0,
      documentsBytes: 0,
    };
    for (const file of database.files) {
      const size = file.size || 0;
      if (file.mimeType.startsWith("image/")) {
        totals.images += 1;
        totals.imagesBytes += size;
      } else if (file.mimeType.startsWith("video/")) {
        totals.videos += 1;
        totals.videosBytes += size;
      } else {
        totals.documents += 1;
        totals.documentsBytes += size;
      }
    }

    const signupsPerDay: Array<{ day: string; count: number }> = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const dayStart = startOfDayUtc(new Date(now - offset * 24 * 60 * 60 * 1000));
      const count = database.users.filter((u) => {
        const created = Date.parse(u.createdAt);
        return Number.isFinite(created) && created >= dayStart && created < dayStart + 24 * 60 * 60 * 1000;
      }).length;
      signupsPerDay.push({ day: new Date(dayStart).toISOString().slice(0, 10), count });
    }

    const topUsers = database.users
      .map((u) => {
        const owned = database.files.filter((f) => f.userId === u.id);
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          bytes: owned.reduce((sum, f) => sum + (f.size || 0), 0),
          fileCount: owned.length,
        };
      })
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5);

    const published = (database.releases ?? []).filter((r) => r.status === "published");
    const latest = published.sort((a, b) => b.versionCode - a.versionCode)[0] ?? null;

    return {
      totals,
      admins: database.users.filter((u) => u.role === "admin").length,
      banned: database.users.filter((u) => u.accountStatus === "banned").length,
      suspended: database.users.filter((u) => u.accountStatus === "suspended").length,
      premiumActive: database.users.filter((u) => u.subscription?.tier === "premium" && u.subscription?.status === "active").length,
      newUsers7d: database.users.filter((u) => Date.parse(u.createdAt) >= day7).length,
      newUsers30d: database.users.filter((u) => Date.parse(u.createdAt) >= day30).length,
      logins7d: database.users.filter((u) => u.lastLoginAt && Date.parse(u.lastLoginAt) >= day7).length,
      logins30d: database.users.filter((u) => u.lastLoginAt && Date.parse(u.lastLoginAt) >= day30).length,
      uploads7d: database.files.filter((f) => Date.parse(f.createdAt) >= day7).length,
      uploads30d: database.files.filter((f) => Date.parse(f.createdAt) >= day30).length,
      signupsPerDay,
      topUsers,
      publishedRelease: latest
        ? { versionName: latest.versionName, versionCode: latest.versionCode, publishedAt: latest.publishedAt ?? latest.createdAt }
        : null,
      recentActivity: (database.activityLog ?? []).slice().sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 10),
    };
  });
}
