import { NextRequest } from "next/server";
import { authorityErrorPayload, authorizeRequest } from "@/lib/backend-authority";
import { checkRateLimitWithIp } from "@/lib/rate-limit";
import { setMaintenanceState } from "@/lib/telegram-store";
import { mobileJson, readMobileJson, requestIp } from "@/app/api/mobile/v1/_shared";

export async function PATCH(request: NextRequest) {
  try {
    const principal = await authorizeRequest("admin:write");
    checkRateLimitWithIp(principal.user.id, requestIp(request), "adminWrite");
  } catch (error) {
    if ((error as { status?: number }).status === 429) {
      return mobileJson({ error: "Too many requests. Try again soon." }, { status: 429 });
    }
    const failure = authorityErrorPayload(error);
    return mobileJson(failure.body, { status: failure.status });
  }

  const body = await readMobileJson(request);
  if (!body || typeof body.enabled !== "boolean") {
    return mobileJson({ error: "enabled must be a boolean" }, { status: 400 });
  }
  if (!(body.message === undefined || body.message === null || typeof body.message === "string")) {
    return mobileJson({ error: "message must be a string or null" }, { status: 400 });
  }
  const system = await setMaintenanceState(
    body.enabled,
    typeof body.message === "string" ? body.message : null,
  );
  return mobileJson({ ok: true, system });
}
