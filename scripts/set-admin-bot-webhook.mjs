#!/usr/bin/env node
/**
 * TellyBase — one-time webhook setup / teardown for the private admin-console bot.
 *
 * Production mode (no bridge, no VPS): Telegram pushes updates straight to
 * /api/admin-bot/webhook; the site replies to the bot via executeBotOutboundBatch.
 *
 * Usage:
 *   npm run admin-bot:webhook -- https://your-site.example
 *   npm run admin-bot:webhook-unset
 *
 * The webhook URL must be public HTTPS. Set ADMIN_BOT_WEBHOOK_URL or pass URL
 * as the first argument. The secret_token is ADMIN_BOT_SHARED_SECRET.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

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
const API_BASE = (process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/$/, "");
const UNSET = process.argv.includes("--unset") || process.argv.includes("-u");

function fail(message) {
  console.error(`[set-webhook] ${message}`);
  process.exit(1);
}

if (!BOT_TOKEN) fail("TELEGRAM_ADMIN_BOT_TOKEN is required.");
if (!SHARED_SECRET) {
  if (process.env.NODE_ENV === "production") {
    fail("ADMIN_BOT_SHARED_SECRET is required in production (run: openssl rand -hex 32).");
  } else {
    console.warn("[set-webhook] ADMIN_BOT_SHARED_SECRET not set; using local fallback for diagnostics.");
    process.env.ADMIN_BOT_SHARED_SECRET = process.env.ADMIN_BOT_SHARED_SECRET || "tellybase-local-admin-bot-key";
  }
}

const secret = process.env.ADMIN_BOT_SHARED_SECRET || "";

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

async function main() {
  if (UNSET) {
    console.log("[set-webhook] Removing webhook (deleteWebhook)...");
    const info = await telegramApi("deleteWebhook", { drop_pending_updates: true });
    console.log("[set-webhook] Webhook removed.", info ? `info=${JSON.stringify(info)}` : "");
    return;
  }

  const urlArg = process.argv.find((a) => a.startsWith("http"));
  const webhookUrl = process.env.ADMIN_BOT_WEBHOOK_URL || (urlArg ? urlArg.trim() : null);
  if (!webhookUrl) {
    fail("Web URL required. Pass as argument or set ADMIN_BOT_WEBHOOK_URL (e.g. https://site.example/api/admin-bot/webhook).");
  }

  console.log(`[set-webhook] Configuring webhook for bot ${BOT_TOKEN.slice(0, 10)}...`);
  console.log(`  URL: ${webhookUrl}`);
  console.log(`  secret_token = ${secret.slice(0, 6)}...`);

  const setResult = await telegramApi("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  console.log("[set-webhook] setWebhook ok.", setResult ? JSON.stringify(setResult) : "");

  const info = await telegramApi("getWebhookInfo", {});
  console.log("[set-webhook] getWebhookInfo:");
  console.log("  url:", info?.url || "—");
  console.log("  has_custom_certificate:", info?.has_custom_certificate ?? "—");
  console.log("  pending_update_count:", info?.pending_update_count ?? "—");
  console.log("  ip_address:", info?.ip_address || "—");
  console.log("  last_error_date:", info?.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : "—");
  console.log("  last_error_message:", info?.last_error_message || "—");
  console.log("  max_connections:", info?.max_connections ?? "—");
  console.log("  allowed_updates:", info?.allowed_updates ? info.allowed_updates.join(", ") : "—");

  if (info?.url !== webhookUrl) {
    console.warn("[set-webhook] WARNING: getWebhookInfo URL does not match expected webhook URL.");
  }
  if (info?.pending_update_count && info.pending_update_count > 0) {
    console.warn(`[set-webhook] WARNING: ${info.pending_update_count} pending update(s).`);
  }
  if (info?.last_error_message) {
    console.warn(`[set-webhook] WARNING: Telegram reports last webhook error: ${info.last_error_message}`);
  }
}

main().catch((err) => {
  console.error("[set-webhook] Fatal:", err.message || err);
  process.exit(1);
});
