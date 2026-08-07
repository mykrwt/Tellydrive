import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { isAuthorizedAdminTelegramId, getAdminBotSharedSecret, getAdminBotTelegramConfig } from "@/lib/server/admin-telegram-config";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Gateway security for the private Telegram admin-console bot.
 *
 * The bridge process (scripts/admin-bot.mjs) is the only caller. It fetches
 * updates from Telegram with the private admin bot token, signs the raw JSON
 * body with a shared secret, and posts it here. This module proves:
 *
 *   1. the request really came from our own System A bridge (HMAC signature +
 *      freshness window), and
 *   2. the Telegram account that produced the update is the operator's
 *      authorized administrator account (TELEGRAM_ADMIN_IDS allowlist).
 *
 * Only after both hold does the backend interpret the update and execute the
 * requested operation. The bridge never contains business logic.
 */

export const ADMIN_BOT_SIGNATURE_HEADER = "x-admin-bot-signature";
export const ADMIN_BOT_AT_HEADER = "x-admin-bot-at";
export const ADMIN_BOT_ID_HEADER = "x-admin-bot-id";
const FRESHNESS_WINDOW_MS = 5 * 60 * 1000;
const UPDATE_ID_TTL_MS = 10 * 60 * 1000;
const UPDATE_ID_MAX = 2000;

export class AdminBotGatewayError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdminBotGatewayError";
  }
}

export type AdminBotUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
    text?: string;
    document?: {
      file_id: string;
      file_name?: string;
      file_size?: number;
      mime_type?: string;
    };
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; last_name?: string; username?: string };
    message?: {
      message_id: number;
      chat: { id: number; type: string };
    };
    data?: string;
  };
};

export type AdminBotPrincipal = Readonly<{
  update: AdminBotUpdate;
  senderId: number;
  senderName: string;
}>;

// Recently seen update ids (replay / duplicate delivery protection). The
// bridge retries unacknowledged updates after crashes, so dedupe is required.
// Keys are namespaced per bot identity so two bridges sharing a gateway can
// never collide on the same numeric update id.
const seenUpdateIds = new Map<string, number>();
let lastPrune = Date.now();
function rememberUpdateId(botId: string, updateId: number): boolean {
  const key = `${botId}:${updateId}`;
  const now = Date.now();
  if (now - lastPrune > 60_000) {
    lastPrune = now;
    for (const [id, at] of seenUpdateIds) {
      if (at < now - UPDATE_ID_TTL_MS) seenUpdateIds.delete(id);
    }
    if (seenUpdateIds.size > UPDATE_ID_MAX) {
      const oldest = [...seenUpdateIds.keys()].slice(0, seenUpdateIds.size - UPDATE_ID_MAX);
      for (const id of oldest) seenUpdateIds.delete(id);
    }
  }
  if (seenUpdateIds.has(key)) return false;
  seenUpdateIds.set(key, now);
  return true;
}

function signatureFor(secret: string, at: string, rawBody: string): Buffer {
  return createHmac("sha256", secret).update(`${at}\n${rawBody}`, "utf8").digest();
}

export function verifyAdminBotSignature(rawBody: string, at: string, signature: string | null): boolean {
  const secret = getAdminBotSharedSecret();
  if (!secret) return false;
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const atNumber = Number(at);
  if (!Number.isFinite(atNumber)) return false;
  if (Math.abs(Date.now() - atNumber * 1000) > FRESHNESS_WINDOW_MS) return false;
  const expected = signatureFor(secret, at, rawBody);
  const provided = Buffer.from(signature, "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function senderOf(update: AdminBotUpdate): { id: number; name: string } | null {
  const from = update.message?.from ?? update.callback_query?.from;
  if (!from || !Number.isInteger(from.id) || from.id <= 0) return null;
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || `user:${from.id}`;
  return { id: from.id, name: name.slice(0, 60) };
}

/**
 * Validate the signed bridge request and the operator identity behind it.
 * Throws AdminBotGatewayError with an HTTP status on every failure path.
 */
export function claimAdminBotUpdateId(updateId: number): boolean {
  const botId = getAdminBotTelegramConfig().token
    ? `bot:${getAdminBotTelegramConfig().token.slice(0, 12)}`
    : "admin-bot";
  return rememberUpdateId(botId, updateId);
}

export async function authorizeAdminBotRequest(request: NextRequest): Promise<AdminBotPrincipal> {
  const rawBody = await request.text();
  if (!rawBody) throw new AdminBotGatewayError(400, "Empty request body.");

  const at = request.headers.get(ADMIN_BOT_AT_HEADER) ?? "";
  const signature = request.headers.get(ADMIN_BOT_SIGNATURE_HEADER);
  if (!verifyAdminBotSignature(rawBody, at, signature)) {
    throw new AdminBotGatewayError(401, "Invalid admin bot signature.");
  }

  const botId = request.headers.get(ADMIN_BOT_ID_HEADER) ?? "";
  if (!botId || botId.length > 64 || !/^[A-Za-z0-9_.:-]+$/.test(botId)) {
    throw new AdminBotGatewayError(401, "Missing admin bot identity.");
  }

  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    throw new AdminBotGatewayError(400, "Invalid JSON body.");
  }
  const update = (value as { update?: unknown })?.update as AdminBotUpdate | undefined;
  if (!update || typeof update !== "object" || !Number.isInteger(update.update_id)) {
    throw new AdminBotGatewayError(400, "Invalid update payload.");
  }
  if (!rememberUpdateId(botId, update.update_id)) {
    throw new AdminBotGatewayError(409, "Duplicate update id.");
  }

  const sender = senderOf(update);
  if (!sender) {
    throw new AdminBotGatewayError(400, "Update has no sender identity.");
  }
  if (!isAuthorizedAdminTelegramId(sender.id)) {
    throw new AdminBotGatewayError(403, "Sender is not an authorized administrator.");
  }

  try {
    checkRateLimit(`bot:${sender.id}`, "adminBot");
  } catch (error) {
    const err = error as { status?: number };
    throw new AdminBotGatewayError(err.status === 429 ? 429 : 500, "Admin bot rate limit exceeded.");
  }

  return Object.freeze({ update, senderId: sender.id, senderName: sender.name });
}
