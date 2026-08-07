import { NextRequest } from "next/server";
import { AdminBotGatewayError, authorizeAdminBotRequest } from "@/lib/server/admin-bot-gateway";
import { handleAdminBotUpdate } from "@/lib/server/admin-console";
import { mobileJson } from "@/app/api/mobile/v1/_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Private gateway for the Telegram admin-console bridge.
 *
 * Only scripts/admin-bot.mjs may call this endpoint. The request must carry a
 * fresh HMAC signature over the raw body (shared secret) and the update must
 * come from an authorized administrator Telegram account — both validated by
 * authorizeAdminBotRequest before any business logic runs.
 */
export async function POST(request: NextRequest) {
  let principal;
  try {
    principal = await authorizeAdminBotRequest(request);
  } catch (error) {
    if (error instanceof AdminBotGatewayError) {
      if (error.status === 401 || error.status === 403) {
        // Never reveal whether a signature or an allowlist failed.
        return mobileJson({ error: "Unauthorized." }, { status: 403 });
      }
      return mobileJson({ error: error.message }, { status: error.status });
    }
    console.error("Admin bot gateway failed:", error);
    return mobileJson({ error: "The admin bot gateway is temporarily unavailable." }, { status: 500 });
  }

  try {
    const outbound = await handleAdminBotUpdate(principal.update, {
      senderId: principal.senderId,
      senderName: principal.senderName,
    });
    return mobileJson({ outbound });
  } catch (error) {
    console.error("Admin console handler failed:", error);
    // Keep the bridge acking the update so it never loops on a poisoned input.
    return mobileJson({ outbound: [] }, { status: 200 });
  }
}
