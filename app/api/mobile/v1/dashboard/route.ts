import { getCurrentUser } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/dashboard-summary";
import { mobileJson, mobileUser } from "@/app/api/mobile/v1/_shared";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return mobileJson({ error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await getDashboardSummary(user.id);
    return mobileJson({ user: mobileUser(user), summary });
  } catch (error) {
    console.error("Mobile dashboard failed:", error);
    return mobileJson({ error: "Could not load your storage summary." }, { status: 500 });
  }
}
