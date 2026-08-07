import { getAdminUser } from "@/lib/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAdminOverview } from "@/lib/telegram-store";
import { mobileJson } from "@/app/api/mobile/v1/_shared";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return mobileJson({ error: "Forbidden" }, { status: 403 });
  try {
    checkRateLimit(admin.id, "adminRead");
    return mobileJson({ overview: await getAdminOverview() });
  } catch (error) {
    const status = (error as { status?: number }).status === 429 ? 429 : 500;
    if (status === 500) console.error("Mobile admin overview failed:", error);
    return mobileJson(
      { error: status === 429 ? "Too many requests. Try again soon." : "Could not load the admin workspace." },
      { status },
    );
  }
}
