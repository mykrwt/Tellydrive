import { NextRequest } from "next/server";
import { authorityErrorPayload, authorizeRequest } from "@/lib/backend-authority";
import { getDashboardSummary } from "@/lib/dashboard-summary";
import { checkRateLimitWithIp } from "@/lib/rate-limit";
import { mobileJson, mobileUser, requestIp } from "@/app/api/mobile/v1/_shared";

export async function GET(request: NextRequest) {
  try {
    const principal = await authorizeRequest("storage:read");
    checkRateLimitWithIp(principal.user.id, requestIp(request), "list");
    const summary = await getDashboardSummary(principal.user.id);
    return mobileJson({ user: mobileUser(principal.user), summary });
  } catch (error) {
    if ((error as { status?: number }).status === 429) {
      return mobileJson({ error: "Too many requests. Try again soon." }, { status: 429 });
    }
    const failure = authorityErrorPayload(error);
    if (failure.status === 500) console.error("Mobile dashboard failed:", error);
    return mobileJson(failure.body, { status: failure.status });
  }
}
