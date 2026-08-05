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
};

type AuthDatabase = {
  version: 1;
  revision: number;
  updatedAt: string;
  users: StoredUser[];
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
    (typeof user.lastLoginAt === "string" || user.lastLoginAt === null)
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
  };
}

function telegramConfig() {
  return {
    token: process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "",
    chatId: process.env.TELEGRAM_CHAT_ID?.trim() ?? "",
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
  const response = await fetch(`${apiBase}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json()) as TelegramResponse<T>;
  if (!response.ok || !payload.ok) {
    const detail = payload.ok ? `HTTP ${response.status}` : payload.description;
    throw new AccountStoreError(`Telegram ${method} failed${detail ? `: ${detail}` : ""}.`, true);
  }
  return payload.result;
}

async function loadTelegram(): Promise<AuthDatabase> {
  const { token, chatId, apiBase } = telegramConfig();
  const chat = await telegramApi<TelegramChat>("getChat", { chat_id: chatId });
  const fileId = chat.description?.match(POINTER)?.[1];
  if (!fileId) return emptyDatabase();

  const file = await telegramApi<TelegramFile>("getFile", { file_id: fileId });
  if (!file.file_path) throw new AccountStoreError("Telegram did not return the database file.");

  const response = await fetch(`${apiBase}/file/bot${token}/${file.file_path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new AccountStoreError("Could not download the Telegram account database.");
  return parseDatabase(await response.text());
}

async function saveTelegram(database: AuthDatabase): Promise<void> {
  const { token, chatId, apiBase } = telegramConfig();
  const serialized = JSON.stringify(database, null, 2);
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append(
    "document",
    new Blob([serialized], { type: "application/json" }),
    `tellybase-auth-r${database.revision}.json`,
  );
  form.append("caption", `Tellybase auth database · revision ${database.revision}`);

  const response = await fetch(`${apiBase}/bot${token}/sendDocument`, {
    method: "POST",
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json()) as TelegramResponse<TelegramDocumentMessage>;
  if (!response.ok || !payload.ok) {
    const detail = payload.ok ? `HTTP ${response.status}` : payload.description;
    throw new AccountStoreError(`Telegram upload failed${detail ? `: ${detail}` : ""}.`, true);
  }
  const fileId = payload.result.document?.file_id;
  if (!fileId) throw new AccountStoreError("Telegram did not return a file id.");

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
