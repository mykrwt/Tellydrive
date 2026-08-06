import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  lastLoginAt: string | null;
  telegramToken?: string;
  telegramChatId?: string;
};

export type StoredFile = {
  id: string;
  userId: string;
  name: string;
  telegramFileId: string;
  size: number;
  mimeType: string;
  createdAt: string;
};

type AuthDatabase = {
  version: 1;
  revision: number;
  updatedAt: string;
  users: StoredUser[];
  files: StoredFile[];
};

type TelegramResponse<T> =
  | { ok: true; result: T }
  | { ok: false; description?: string };

type TelegramChat = { description?: string };
type TelegramFile = { file_path?: string };
type TelegramDocumentMessage = { document?: { file_id?: string } };

const POINTER = /TBAUTH:([A-Za-z0-9_-]+)/;
const MAX_DATABASE_BYTES = 5 * 1024 * 1024;
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
    (user.telegramToken === undefined || typeof user.telegramToken === "string") &&
    (user.telegramChatId === undefined || typeof user.telegramChatId === "string")
  );
}

function isStoredFile(value: unknown): value is StoredFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  return (
    typeof file.id === "string" &&
    typeof file.userId === "string" &&
    typeof file.name === "string" &&
    typeof file.telegramFileId === "string" &&
    typeof file.size === "number" &&
    typeof file.mimeType === "string" &&
    typeof file.createdAt === "string"
  );
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
  return {
    version: 1,
    revision: Number.isInteger(db.revision) ? Number(db.revision) : 0,
    updatedAt: typeof db.updatedAt === "string" ? db.updatedAt : new Date().toISOString(),
    users: db.users,
    files: Array.isArray(db.files) ? db.files.filter(isStoredFile) : [],
  };
}

function telegramConfig() {
  let token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  if (token.startsWith("bot")) {
    token = token.slice(3);
  }
  token = token.replace(/^["']|["']$/g, "").trim();

  let chatId = process.env.TELEGRAM_CHAT_ID?.trim() ?? "";
  chatId = chatId.replace(/^["']|["']$/g, "").trim();

  return {
    token,
    chatId,
    apiBase: (process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/$/, ""),
  };
}

export function databaseMode(): "telegram" | "local" | "unconfigured" {
  const { token, chatId } = telegramConfig();
  if (token && chatId) return "telegram";
  return process.env.NODE_ENV === "production" ? "unconfigured" : "local";
}

async function telegramApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const { token, apiBase } = telegramConfig();
  if (!token) {
    throw new AccountStoreError("TELEGRAM_BOT_TOKEN is missing.", true);
  }

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

    // Harmless warning when chat description hasn't changed
    if (method === "setChatDescription" && detail.toLowerCase().includes("not modified")) {
      return {} as T;
    }

    throw new AccountStoreError(`Telegram ${method} failed: ${detail}`, true);
  }

  return payload.result;
}

async function loadTelegram(): Promise<AuthDatabase> {
  const { token, chatId, apiBase } = telegramConfig();
  if (!chatId) {
    throw new AccountStoreError("TELEGRAM_CHAT_ID is missing.", true);
  }

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

  if (!response.ok) {
    throw new AccountStoreError(`Could not download database file from Telegram (HTTP ${response.status}).`, true);
  }

  return parseDatabase(await response.text());
}

async function saveTelegram(database: AuthDatabase): Promise<void> {
  const { token, chatId, apiBase } = telegramConfig();
  if (!token || !chatId) {
    throw new AccountStoreError("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing.", true);
  }

  const serialized = JSON.stringify(database, null, 2);
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append(
    "document",
    new Blob([serialized], { type: "application/json" }),
    `tellybase-auth-r${database.revision}.json`,
  );
  form.append("caption", `Tellybase auth database · revision ${database.revision}`);

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

  await telegramApi("setChatDescription", {
    chat_id: chatId,
    description: `TBAUTH:${fileId}`,
  });
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

async function load(): Promise<AuthDatabase> {
  const mode = databaseMode();
  if (mode === "telegram") return loadTelegram();
  if (mode === "local") return loadLocal();
  throw new AccountStoreError(
    "Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable sign in.",
    true,
  );
}

async function save(database: AuthDatabase): Promise<void> {
  if (databaseMode() === "telegram") return saveTelegram(database);
  return saveLocal(database);
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation, operation);
  queue = result.then(
    () => undefined,
    () => undefined,
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
    if (database.users.some((entry) => entry.email === user.email)) {
      throw new AccountStoreError("An account with that email already exists.");
    }
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

export async function updateUserSettings(
  userId: string,
  updates: { telegramToken?: string; telegramChatId?: string },
): Promise<void> {
  return serialized(async () => {
    const database = await load();
    const user = database.users.find((entry) => entry.id === userId);
    if (!user) throw new Error("User not found");
    
    if (updates.telegramToken !== undefined) user.telegramToken = updates.telegramToken;
    if (updates.telegramChatId !== undefined) user.telegramChatId = updates.telegramChatId;
    
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
  });
}

export async function getFilesForUser(userId: string): Promise<StoredFile[]> {
  return serialized(async () => {
    const database = await load();
    return database.files.filter((file) => file.userId === userId);
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
      } catch (err) {
        console.error("Failed to delete local file:", err);
      }
    }

    database.files.splice(index, 1);
    database.revision += 1;
    database.updatedAt = new Date().toISOString();
    await save(database);
  });
}

export async function uploadToTelegram(
  name: string,
  blob: Blob,
  userConfig?: { token: string; chatId: string }
): Promise<{ fileId: string }> {
  let token: string | undefined;
  let chatId: string | undefined;
  let apiBase = (process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/$/, "");

  if (userConfig?.token && userConfig?.chatId) {
    token = userConfig.token;
    chatId = userConfig.chatId;
  } else {
    const config = telegramConfig();
    token = config.token;
    chatId = config.chatId;
    apiBase = config.apiBase;
  }

  if (!token || !chatId) {
    if (databaseMode() === "local") {
      const id = randomUUID();
      const destination = path.join(process.cwd(), ".data", "files", id);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, Buffer.from(await blob.arrayBuffer()));
      return { fileId: `local:${id}` };
    }
    throw new AccountStoreError("Telegram configuration is missing. Please set your Bot Token and Chat ID in settings.");
  }

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("document", blob, name);

  let response: Response;
  try {
    response = await fetch(`${apiBase}/bot${token}/sendDocument`, {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(60_000), // Files can take longer
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network error";
    throw new AccountStoreError(`Failed to upload file to Telegram (${msg}).`);
  }

  let payload: TelegramResponse<TelegramDocumentMessage>;
  try {
    payload = (await response.json()) as TelegramResponse<TelegramDocumentMessage>;
  } catch {
    throw new AccountStoreError(`Invalid response from Telegram (HTTP ${response.status}).`);
  }

  if (!response.ok || !payload.ok) {
    const detail = payload.ok ? `HTTP ${response.status}` : payload.description || `HTTP ${response.status}`;
    throw new AccountStoreError(`Telegram upload failed: ${detail}`);
  }

  const fileId = payload.result.document?.file_id;
  if (!fileId) throw new AccountStoreError("Telegram did not return a file id.");

  return { fileId };
}

export async function getTelegramFileUrl(fileId: string, userConfig?: { token: string }): Promise<string> {
  if (fileId.startsWith("local:")) {
    const id = fileId.slice(6);
    return `/api/local-file?id=${id}`;
  }

  let token: string | undefined;
  let apiBase = (process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/$/, "");

  if (userConfig?.token) {
    token = userConfig.token;
  } else {
    const config = telegramConfig();
    token = config.token;
    apiBase = config.apiBase;
  }

  if (!token) throw new AccountStoreError("Bot Token is missing.");

  // Manual API call to getFile to avoid using the global telegramApi which uses env token
  const response = await fetch(`${apiBase}/bot${token}/getFile?file_id=${fileId}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new AccountStoreError(`Telegram getFile failed (HTTP ${response.status})`);
  const payload = await response.json();
  if (!payload.ok) throw new AccountStoreError(`Telegram getFile failed: ${payload.description}`);

  const file_path = payload.result.file_path;
  if (!file_path) throw new AccountStoreError("Telegram did not return the file path.");

  return `${apiBase}/file/bot${token}/${file_path}`;
}
