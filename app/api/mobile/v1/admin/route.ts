import { getAdminUser } from "@/lib/admin";
import { getAdminOverview } from "@/lib/telegram-store";
import { mobileJson } from "@/app/api/mobile/v1/_shared";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return mobileJson({ error: "Forbidden" }, { status: 403 });
  try {
    return mobileJson({ overview: await getAdminOverview() });
  } catch (error) {
    console.error("Mobile admin overview failed:", error);
    return mobileJson({ error: "Could not load the admin workspace." }, { status: 500 });
  }
}
