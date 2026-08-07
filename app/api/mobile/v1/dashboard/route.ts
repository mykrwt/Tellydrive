import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/dashboard-summary";
import { checkRateLimitWithIp } from "@/lib/rate-limit";
import { mobileJson, mobileUser, requestIp } from "@/app/api/mobile/v1/_shared";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return mobileJson({ error: "Unauthorized" }, { status: 401 });
  try {
    checkRateLimitWithIp(user.id, requestIp(request), "list");
    const summary = await getDashboardSummary(user.id);
    return mobileJson({ user: mobileUser(user), summary });
  } catch (error) {
    const status = (error as { status?: number }).status === 429 ? 429 : 500;
    if (status === 500) console.error("Mobile dashboard failed:", error);
    return mobileJson(
      { error: status === 429 ? "Too many requests. Try again soon." : "Could not load your storage summary." },
      { status },
    );
  }
}
