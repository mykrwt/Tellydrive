import "server-only";

/**
 * System A: private Telegram infrastructure owned by the operator.
 *
 * This is the only application module allowed to read Telegram infrastructure
 * environment variables. Values returned here are server-only capabilities:
 * they must be used for outbound backend calls and must never be serialized,
 * logged, redirected to, or returned by an API/server action.
 *
 * No System B (user Telegram identity) credential is accepted here.
 */

export type AdminTelegramConfig = Readonly<{
  token: string;
  chatId: string;
  apiBase: string;
}>;

export type AdminStorageTelegramConfig = AdminTelegramConfig &
  Readonly<{
    usesDedicatedChannel: boolean;
    usesDedicatedBot: boolean;
  }>;

const DEFAULT_TELEGRAM_API_BASE = "https://api.telegram.org";

function clean(value: string | undefined): string {
  return (value ?? "").replace(/^[\"']|[\"']$/g, "").trim();
}

function cleanBotToken(value: string | undefined): string {
  const token = clean(value);
  return token.startsWith("bot") ? token.slice(3) : token;
}

/** Private account-database channel and bot (System A). */
export function getAdminAccountTelegramConfig(): AdminTelegramConfig {
  return Object.freeze({
    token: cleanBotToken(process.env.TELEGRAM_BOT_TOKEN),
    chatId: clean(process.env.TELEGRAM_CHAT_ID),
    apiBase: clean(process.env.TELEGRAM_API_BASE).replace(/\/$/, "") || DEFAULT_TELEGRAM_API_BASE,
  });
}

/** Private file-storage channel and bot (System A). */
export function getAdminStorageTelegramConfig(): AdminStorageTelegramConfig {
  const account = getAdminAccountTelegramConfig();
  const dedicatedChatId = clean(process.env.TELEGRAM_STORAGE_CHAT_ID);
  const dedicatedToken = cleanBotToken(process.env.TELEGRAM_STORAGE_BOT_TOKEN);
  return Object.freeze({
    token: dedicatedToken || account.token,
    chatId: dedicatedChatId || account.chatId,
    apiBase: account.apiBase,
    usesDedicatedChannel: Boolean(dedicatedChatId),
    usesDedicatedBot: Boolean(dedicatedToken),
  });
}

export function adminTelegramDatabaseMode(): "telegram" | "local" | "unconfigured" {
  const { token, chatId } = getAdminAccountTelegramConfig();
  if (token && chatId) return "telegram";
  return process.env.NODE_ENV === "production" ? "unconfigured" : "local";
}

/** Server-only signing material for application sessions and upload grants. */
export function getServerSessionSigningSecret(): string {
  return (
    clean(process.env.SESSION_SECRET) ||
    getAdminAccountTelegramConfig().token ||
    (process.env.NODE_ENV !== "production" ? "tellybase-local-development-session-key" : "")
  );
}
