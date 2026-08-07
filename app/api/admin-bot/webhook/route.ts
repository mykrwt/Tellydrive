import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  getAdminBotSharedSecret,
  isAuthorizedAdminTelegramId,
} from "@/lib/server/admin-telegram-config";
import {
  claimAdminBotUpdateId,
  senderOf,
  AdminBotUpdate,
} from "@/lib/server/admin-bot-gateway";
import { handleAdminBotUpdate } from "@/lib/server/admin-console";
import { executeBotOutboundBatch } from "@/lib/server/admin-bot-outbound";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

function constantTimeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // 1. Secret token header — constant-time compare against ADMIN_BOT_SHARED_SECRET
  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const expectedSecret = getAdminBotSharedSecret();
  if (!expectedSecret || !constantTimeEqual(secretHeader, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  // 2. Parse Telegram update body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const update = (body as Record<string, unknown>) as AdminBotUpdate;
  if (!update || typeof update !== "object" || !Number.isInteger(update.update_id)) {
    return NextResponse.json({ error: "Invalid update payload." }, { status: 400 });
  }

  // 3. Replay / duplicate protection (per-bot claim)
  if (!claimAdminBotUpdateId(update.update_id)) {
    // Telegram retries non-2xx; returning 200 with dedupe flag prevents loops.
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
  }

  // 4. Sender allowlist — only authorized administrators
  const sender = senderOf(update);
  if (!sender) {
    return NextResponse.json({ error: "No sender identity." }, { status: 400 });
  }
  if (!isAuthorizedAdminTelegramId(sender.id)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // 5. Rate limit per operator (adminBot = 90/min)
  try {
    checkRateLimit(`bot:${sender.id}`, "adminBot");
  } catch (e) {
    const err = e as { status?: number };
    return NextResponse.json(
      { error: "Rate limit exceeded." },
      { status: err.status === 429 ? 429 : 500 },
    );
  }

  // 6. Interpret update and execute outbound replies directly from the backend
  try {
    const outbound = await handleAdminBotUpdate(update, {
      senderId: sender.id,
      senderName: sender.name,
    });
    await executeBotOutboundBatch(outbound);
    return NextResponse.json({ ok: true, outboundSent: outbound.length }, { status: 200 });
  } catch (error) {
    console.error("Admin bot webhook processing failed:", error);
    // Keep Telegram from retrying a poisoned payload; return 500 so it can retry if transient,
    // but in practice the duplicate claim already protected us.
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }
}
