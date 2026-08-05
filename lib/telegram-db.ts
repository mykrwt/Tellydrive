import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { config } from "@/lib/config";

// Persists the SQLite metadata database on Telegram so the app's data survives
// serverless cold starts. The sqlite file is uploaded as a Telegram document
// and the latest file_id is kept in the chat description (see
// telegram-db-worker.mjs), which is rediscoverable from a stateless function
// without any persistent local state.

const WORKER = path.join(process.cwd(), "lib", "telegram-db-worker.mjs");

export function isTelegramDbConfigured(): boolean {
  return Boolean(config.telegram.botToken && config.telegram.chatId);
}

// Run the worker and return its exit code (0 success, 3 no-pointer/fresh,
// 1 error, 2 usage).
function runWorkerExitCode(mode: "restore" | "flush", dbPath: string): number {
  try {
    execFileSync(process.execPath, [WORKER, mode, dbPath], {
      env: {
        ...process.env,
        TELEGRAM_BOT_TOKEN: config.telegram.botToken,
        TELEGRAM_CHAT_ID: config.telegram.chatId,
      },
      encoding: "utf8",
      timeout: 60_000,
      stdio: ["ignore", "ignore", "inherit"],
    });
    return 0;
  } catch (e) {
    return typeof (e as { status?: unknown }).status === "number"
      ? ((e as { status: number }).status)
      : 1;
  }
}

/**
 * Ensure a local copy of the sqlite DB exists at `dbPath`, downloading it from
 * Telegram when it isn't present locally (e.g. cold start on a serverless host).
 *
 * Returns:
 *   "skipped"  — Telegram is not configured; use a plain local DB.
 *   "restored" — a local copy is already present or was downloaded from Telegram.
 *   "fresh"    — no Telegram copy existed yet; a brand-new DB will be created and
 *                should be uploaded once after seeding.
 *   "error"    — a Telegram copy exists but couldn't be downloaded (network /
 *                transient failure). A local-only copy is used for this request
 *                and NOT written back, so existing Telegram data is preserved.
 */
export function restoreDbSync(dbPath: string): "fresh" | "restored" | "skipped" | "error" {
  if (!isTelegramDbConfigured()) return "skipped";
  if (existsSync(dbPath)) return "restored"; // already have a copy (warm instance / dev)
  const code = runWorkerExitCode("restore", dbPath);
  if (code === 0) return "restored";
  if (code === 3) return "fresh"; // no pointer yet — brand-new install
  console.error(
    `[telegram-db] restore failed (exit ${code}); using a non-persisted local copy ` +
      `for this request. Existing Telegram data was preserved.`,
  );
  return "error";
}

/** Upload the current sqlite DB to Telegram and update the pointer. */
export function flushDbSync(dbPath: string): void {
  if (!isTelegramDbConfigured()) return;
  const code = runWorkerExitCode("flush", dbPath);
  if (code !== 0) {
    console.error(`[telegram-db] flush failed (exit ${code}); data not persisted to Telegram.`);
  }
}
