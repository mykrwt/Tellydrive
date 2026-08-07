#!/usr/bin/env node
/**
 * TellyBase — private Telegram admin-console bridge (System A).
 *
 * This process is intentionally DUMB. It contains zero business logic:
 *
 *   1. long-polls the private admin bot's getUpdates,
 *   2. forwards each update, signed with a shared secret, to the backend
 *      gateway (POST /api/admin-bot/update),
 *   3. blindly executes the Telegram API calls the backend returns
 *      (sendMessage / editMessageText / answerCallbackQuery).
 *
 * The backend validates the signature AND that the sender is an authorized
 * administrator (TELEGRAM_ADMIN_IDS) before it interprets anything.
 *
 * Env (backend-only / operator-only, never shipped in a client):
 *   TELEGRAM_ADMIN_BOT_TOKEN  — token of the private admin-console bot
 *   TELEGRAM_ADMIN_IDS        — comma-separated numeric Telegram user IDs
 *   ADMIN_BOT_SHARED_SECRET   — HMAC secret shared with the backend gateway
 *   ADMIN_BOT_API_URL         — backend base URL (default http://127.0.0.1:3000)
 *   TELEGRAM_API_BASE         — optional Bot API origin override
 *
 * Run:  npm run admin-bot   (backend must be running)
 */
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

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

const BOT_TOKEN = (process.env.TELEGRAM_ADMIN_BOT_TOKEN ?? "").replace(/^bot/, "").trim();
const SHARED_SECRET = (process.env.ADMIN_BOT_SHARED_SECRET ?? "").trim();
const BACKEND_URL = (process.env.ADMIN_BOT_API_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const API_BASE = (process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/+$/, "");
const GATEWAY_PATH = "/api/admin-bot/update";
const POLL_TIMEOUT_SEC = 25;

const ADMIN_IDS = new Set(
  (process.env.TELEGRAM_ADMIN_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value)),
);

// Local development fallback mirrors lib/server/admin-telegram-config.ts so
// the bridge works against a local backend out of the box. In production a
// strong ADMIN_BOT_SHARED_SECRET must be configured on both sides.
const DEV_SECRET = "tellybase-local-admin-bot-key";

function fail(message) {
  console.error(`[admin-bot] ${message}`);
  process.exit(1);
}

if (!BOT_TOKEN) fail("TELEGRAM_ADMIN_BOT_TOKEN is required (BotFather token of the private admin console bot).");
if (!ADMIN_IDS.size) fail("TELEGRAM_ADMIN_IDS is required (comma-separated numeric Telegram user IDs).");

// Identify this bot to the gateway so update ids are deduped per bot.
let botId;
try {
  const me = await telegramApi("getMe", {});
  botId = me?.username ?? `bot:${BOT_TOKEN.split(":")[0] ?? "unknown"}`;
} catch (error) {
  fail(`could not reach Telegram with the admin bot token (${error.message}). Check TELEGRAM_ADMIN_BOT_TOKEN and TELEGRAM_API_BASE.`);
}
if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(botId)) fail(`unexpected bot identity from getMe: ${botId}`);

const effectiveSecret = SHARED_SECRET || (process.env.NODE_ENV !== "production" ? DEV_SECRET : "");
if (!effectiveSecret) {
  fail("ADMIN_BOT_SHARED_SECRET is required in production (run: openssl rand -hex 32).");
}
if (!SHARED_SECRET) {
  console.warn("[admin-bot] ADMIN_BOT_SHARED_SECRET not set — using the local development fallback secret.");
}

// ── Telegram Bot API ──
async function telegramApi(method, body) {
  const res = await fetch(`${API_BASE}/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  let payload;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok || !payload?.ok) {
    const detail = payload?.description ?? `HTTP ${res.status}`;
    throw new Error(`Telegram ${method} failed: ${detail}`);
  }
  return payload.result;
}

async function sendOutbound(action) {
  if (!action || typeof action.method !== "string" || !action.params || typeof action.params !== "object") {
    console.warn("[admin-bot] backend returned an invalid outbound action — skipped");
    return;
  }
  if (!["sendMessage", "editMessageText", "answerCallbackQuery"].includes(action.method)) {
    console.warn(`[admin-bot] ignoring unknown outbound action "${action.method}"`);
    return;
  }
  try {
    await telegramApi(action.method, action.params);
  } catch (error) {
    // A failed UI update (e.g. message edited meanwhile) must not kill the poller.
    console.warn(`[admin-bot] outbound ${action.method} failed: ${error.message}`);
  }
}

// ── Gateway forwarding ──
async function forwardUpdate(update) {
  const rawBody = JSON.stringify({ update });
  const at = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", effectiveSecret).update(`${at}\n${rawBody}`, "utf8").digest("hex");

  let res;
  try {
    res = await fetch(`${BACKEND_URL}${GATEWAY_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Bot-At": String(at),
        "X-Admin-Bot-Signature": signature,
        "X-Admin-Bot-Id": botId,
      },
      body: rawBody,
      signal: AbortSignal.timeout(150_000),
    });
  } catch (error) {
    throw new Error(`gateway unreachable: ${error.message}`);
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const err = new Error(`gateway rejected update (HTTP ${res.status}${payload?.error ? `: ${payload.error}` : ""})`);
    err.status = res.status;
    throw err;
  }

  if (payload?.outbound && Array.isArray(payload.outbound)) {
    for (const action of payload.outbound) {
      await sendOutbound(action);
    }
  }
}

// ── Long polling loop ──
let offset = 0;
let stopping = false;
let failures = 0;

async function pollOnce() {
  const updates = await telegramApi("getUpdates", {
    offset,
    timeout: POLL_TIMEOUT_SEC,
    allowed_updates: ["message", "callback_query"],
  });

  for (const update of updates) {
    const sender = update?.message?.from?.id ?? update?.callback_query?.from?.id;
    const isAdmin = sender !== undefined && ADMIN_IDS.has(String(sender));

    if (isAdmin) {
      try {
        await forwardUpdate(update);
        failures = 0;
      } catch (error) {
        const status = error.status;
        if (typeof status === "number" && status >= 400 && status < 500 && status !== 429) {
          // Permanent rejection (e.g. signature/allowlist mismatch): ack so we
          // never loop on a poisoned update, but log loudly.
          console.error(`[admin-bot] ${error.message} — update ${update.update_id} skipped permanently.`);
        } else {
          // Transient (network / 5xx / 429): keep offset so we retry.
          failures += 1;
          console.error(`[admin-bot] ${error.message} — will retry update ${update.update_id}.`);
          return;
        }
      }
    }
    offset = Math.max(offset, update.update_id + 1);
  }
}

async function main() {
  console.log(`[admin-bot] polling ${API_BASE} → ${BACKEND_URL}${GATEWAY_PATH} (authorized ids: ${[...ADMIN_IDS].join(", ")})`);
  while (!stopping) {
    try {
      await pollOnce();
    } catch (error) {
      failures += 1;
      console.error(`[admin-bot] poll failed: ${error.message}`);
    }
    if (failures > 0) {
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(failures, 5));
      console.warn(`[admin-bot] ${failures} consecutive failure(s); retrying in ${Math.round(delay / 1000)}s`);
      await sleep(delay);
    } else {
      await sleep(300);
    }
  }
  console.log("[admin-bot] stopped.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

await main();
