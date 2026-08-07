import { authorityErrorPayload, authorizeRequest } from "@/lib/backend-authority";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAdminOverview } from "@/lib/telegram-store";
import { mobileJson } from "@/app/api/mobile/v1/_shared";

export async function GET() {
  try {
    const principal = await authorizeRequest("admin:read");
    checkRateLimit(principal.user.id, "adminRead");
    return mobileJson({ overview: await getAdminOverview() });
  } catch (error) {
    if ((error as { status?: number }).status === 429) {
      return mobileJson({ error: "Too many requests. Try again soon." }, { status: 429 });
    }
    const failure = authorityErrorPayload(error);
    if (failure.status === 500) console.error("Mobile admin overview failed:", error);
    return mobileJson(failure.body, { status: failure.status });
  }
}
