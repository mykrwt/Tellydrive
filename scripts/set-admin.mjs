#!/usr/bin/env node
/**
 * Grant (or revoke) the admin role for an account — directly in the database.
 *
 * Why this exists: the Admin page can promote users, but you need an admin
 * already (chicken-and-egg). Bootstrap options:
 *   1. ADMIN_EMAILS env var (no data change; needs a redeploy/restart), or
 *   2. this script — edits the stored `role` in the Telegram-backed database
 *      (or the local `.data/auth.json` dev fallback when Telegram env vars
 *      are not set). Takes effect immediately; no redeploy required.
 *
 * Usage (run from the repo root): pass the exact existing account email as
 * the first argument and optionally add --demote.
 *
 * Reads TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (and TELEGRAM_API_BASE) from the
 * environment or from .env / .env.local.
 */
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2).filter((a) => a !== "--");
const demote = args.includes("--demote");
const emailArg = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();

if (!emailArg || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailArg)) {
  console.error("Usage: node scripts/set-admin.mjs <email> [--demote]");
  process.exit(1);
}

// ── Minimal .env loader (fills only keys not already in process.env) ──
async function loadEnvFile(file) {
  try {
    const raw = await readFile(file, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    /* file missing — fine */
  }
}
await loadEnvFile(path.join(process.cwd(), ".env"));
await loadEnvFile(path.join(process.cwd(), ".env.local"));

let token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
if (token.startsWith("bot")) token = token.slice(3);
const chatId = (process.env.TELEGRAM_CHAT_ID ?? "").trim();
const apiBase = (process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/$/, "");

const POINTER = /TBAUTH:([A-Za-z0-9_-]+)/;
const newRole = demote ? "user" : "admin";

function patchDatabase(raw, label) {
  let db;
  try {
    db = JSON.parse(raw);
  } catch {
    throw new Error(`The ${label} database is not valid JSON.`);
  }
  if (!db || typeof db !== "object" || !Array.isArray(db.users)) {
    throw new Error(`The ${label} database has an unexpected shape.`);
  }
  const user = db.users.find((u) => typeof u.email === "string" && u.email.toLowerCase() === emailArg);
  if (!user) {
    const known = db.users.map((u) => u.email).join(", ") || "(none)";
    throw new Error(`No account found for ${emailArg}. Accounts in this database: ${known}`);
  }
  // Retired mixed-architecture fields must not survive any administrative
  // rewrite of the account database.
  for (const account of db.users) {
    delete account.telegramToken;
    delete account.telegramChatId;
  }
  user.role = newRole;
  db.revision = (Number.isInteger(db.revision) ? db.revision : 0) + 1;
  db.updatedAt = new Date().toISOString();
  return { db, user };
}

function report(user, where) {
  console.log(`✅ ${newRole === "admin" ? "Granted" : "Revoked"} admin ${newRole === "admin" ? "to" : "from"} ${user.email} (${where}).`);
  if (newRole === "admin") {
    console.log("   They can open the Admin page at /dashboard/admin on their next page load (no re-login needed).");
  }
}

async function telegramApi(method, body) {
  const res = await fetch(`${apiBase}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.ok) {
    throw new Error(`Telegram ${method} failed: ${payload?.description ?? `HTTP ${res.status}`}`);
  }
  return payload.result;
}

async function runTelegram() {
  const chat = await telegramApi("getChat", { chat_id: chatId });
  const pointer = chat.description?.match(POINTER)?.[1];
  if (!pointer) throw new Error("No account database found (chat description has no TBAUTH: pointer). Sign up first.");
  const file = await telegramApi("getFile", { file_id: pointer });
  if (!file.file_path) throw new Error("Telegram did not return the database file path.");
  const download = await fetch(`${apiBase}/file/bot${token}/${file.file_path}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!download.ok) throw new Error(`Could not download the database from Telegram (HTTP ${download.status}).`);
  const { db, user } = patchDatabase(await download.text(), "Telegram");

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append(
    "document",
    new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }),
    `tellydrive-auth-r${db.revision}.json`
  );
  form.append("caption", `TellyDrive auth database · revision ${db.revision}`);
  const upload = await fetch(`${apiBase}/bot${token}/sendDocument`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const uploadPayload = await upload.json().catch(() => null);
  if (!upload.ok || !uploadPayload?.ok) {
    throw new Error(`Telegram sendDocument failed: ${uploadPayload?.description ?? `HTTP ${upload.status}`}`);
  }
  const newFileId = uploadPayload.result?.document?.file_id;
  if (!newFileId) throw new Error("Telegram did not return a file id for the updated database.");
  await telegramApi("setChatDescription", { chat_id: chatId, description: `TBAUTH:${newFileId}` });
  report(user, "Telegram database");
}

async function runLocal() {
  const dbPath = path.join(process.cwd(), ".data", "auth.json");
  let raw;
  try {
    raw = await readFile(dbPath, "utf8");
  } catch {
    throw new Error("No local database at .data/auth.json yet — start the app and sign up first.");
  }
  const { db, user } = patchDatabase(raw, "local");
  await mkdir(path.dirname(dbPath), { recursive: true });
  const tmp = `${dbPath}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  await rename(tmp, dbPath);
  report(user, "local development database");
}

try {
  if (token && chatId) await runTelegram();
  else await runLocal();
} catch (err) {
  console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
