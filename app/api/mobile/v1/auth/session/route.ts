import { deleteSession, getCurrentUser } from "@/lib/auth";
import { mobileJson, mobileUser } from "@/app/api/mobile/v1/_shared";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return mobileJson({ error: "Unauthorized" }, { status: 401 });
    return mobileJson({ user: mobileUser(user) });
  } catch (error) {
    console.error("Mobile session lookup failed:", error);
    return mobileJson({ error: "The account service is temporarily unavailable." }, { status: 503 });
  }
}

export async function DELETE() {
  await deleteSession();
  return mobileJson({ ok: true });
}
