import { NextRequest } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { checkRateLimitWithIp } from "@/lib/rate-limit";
import { setUserRole } from "@/lib/telegram-store";
import { mobileJson, readMobileJson, requestIp } from "@/app/api/mobile/v1/_shared";

const ID = /^[a-zA-Z0-9_-]{6,64}$/;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return mobileJson({ error: "Forbidden" }, { status: 403 });
  try {
    checkRateLimitWithIp(admin.id, requestIp(request), "adminWrite");
  } catch {
    return mobileJson({ error: "Too many requests. Try again soon." }, { status: 429 });
  }

  const { id } = await params;
  if (!ID.test(id)) return mobileJson({ error: "Invalid user id" }, { status: 400 });
  if (id === admin.id) {
    return mobileJson({ error: "You cannot change your own role." }, { status: 400 });
  }

  const body = await readMobileJson(request);
  const role = body?.role;
  if (role !== "admin" && role !== "user") {
    return mobileJson({ error: "Role must be admin or user." }, { status: 400 });
  }
  try {
    await setUserRole(id, role);
    return mobileJson({ ok: true, role });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not update role.";
    return mobileJson({ error: message }, { status: message.includes("not found") ? 404 : 500 });
  }
}
