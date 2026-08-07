import "server-only";

import { getAdminBotTelegramConfig } from "@/lib/server/admin-telegram-config";
import type { BotOutbound } from "@/lib/server/admin-console";

export async function executeBotOutboundBatch(outbound: BotOutbound[]): Promise<void> {
  const { token, apiBase, configured } = getAdminBotTelegramConfig();
  if (!configured || !token) {
    console.error("[admin-bot-outbound] TELEGRAM_ADMIN_BOT_TOKEN not configured; cannot send replies.");
    return;
  }
  if (!outbound || outbound.length === 0) return;

  await Promise.all(
    outbound.map(async (action) => {
      try {
        const res = await fetch(`${apiBase}/bot${token}/${action.method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action.params),
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error(`[admin-bot-outbound] ${action.method} HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
      } catch (err) {
        console.error(`[admin-bot-outbound] ${action.method} threw:`, (err as Error).message || err);
      }
    }),
  );
}
