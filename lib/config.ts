// Central configuration. Every secret stays server-side here.
// No token ever reaches the client bundle.

export const config = {
  clerk: {
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
    secretKey: process.env.CLERK_SECRET_KEY ?? "",
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    // Optional: a specific chat/channel id to store uploads in. If empty, the
    // bot's own chat is used (the bot must have been messaged first).
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
  },
  // Storage backend selection. "auto" prefers Telegram when a bot token is set,
  // otherwise falls back to local disk (useful for local dev / no tokens yet).
  storageBackend: (process.env.STORAGE_BACKEND ?? "auto") as
    | "auto"
    | "telegram"
    | "local",
  // Data directory used by the local backend and the sqlite metadata database.
  dataDir: process.env.DATA_DIR ?? "data",
  // Recycle bin retention period in days.
  recycleRetentionDays: Number(process.env.RECYCLE_RETENTION_DAYS ?? 30),
  // Comma separated list of Clerk user ids allowed to access the admin area.
  adminUserIds: (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export function isTelegramConfigured() {
  return Boolean(config.telegram.botToken);
}

export function isClerkConfigured() {
  return Boolean(config.clerk.publishableKey);
}

export { formatBytes, formatDate } from "@/lib/format";
