import { NextRequest } from "next/server";
import { currentUserId } from "@/lib/auth";
import { setUserStorageConfig } from "@/lib/services/users";
import { getStorageManager } from "@/lib/storage";
import { TelegramBackend } from "@/lib/storage/telegram-backend";

export const runtime = "nodejs";

// Connect (PATCH) or disconnect (DELETE) a user's own Telegram storage. On
// connect the credentials are validated against the Telegram Bot API (getChat)
// before saving, so a user can't lock in a broken config.
export async function PATCH(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { botToken?: string; chatId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const botToken = (body.botToken ?? "").trim();
  const chatId = (body.chatId ?? "").trim();
  if (!botToken || !chatId) {
    return Response.json(
      { error: "Both a Telegram bot token and a chat id are required." },
      { status: 400 },
    );
  }

  // Validate the connection before persisting anything.
  const probe = new TelegramBackend({ botToken, chatId });
  const test = await probe.testConnection();
  if (!test.ok) {
    return Response.json(
      {
        error:
          test.error ?? "Could not connect to Telegram with those credentials.",
        detail: test.error,
      },
      { status: 400 },
    );
  }

  const user = setUserStorageConfig(userId, { botToken, chatId });
  return Response.json({
    ok: true,
    title: test.title ?? "Telegram chat",
    backend: getStorageManager(user).label,
  });
}

export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = setUserStorageConfig(userId, { botToken: "", chatId: "" });
  return Response.json({ ok: true, backend: getStorageManager(user).label });
}
