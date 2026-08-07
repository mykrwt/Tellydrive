import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimitWithIp } from "@/lib/rate-limit";
import { getFileById, updateFile } from "@/lib/telegram-store";
import { invalidatePrefix } from "@/lib/api-cache";
import { mobileJson, readMobileJson, requestIp } from "@/app/api/mobile/v1/_shared";

const ID = /^[a-zA-Z0-9_-]{6,64}$/;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return mobileJson({ error: "Unauthorized" }, { status: 401 });
  try {
    checkRateLimitWithIp(user.id, requestIp(request), "folder");
  } catch {
    return mobileJson({ error: "Too many requests. Try again soon." }, { status: 429 });
  }
  const { id } = await params;
  if (!ID.test(id)) return mobileJson({ error: "Invalid id" }, { status: 400 });

  const body = await readMobileJson(request);
  if (!body || typeof body.favorite !== "boolean") {
    return mobileJson({ error: "favorite must be a boolean" }, { status: 400 });
  }
  const file = await getFileById(user.id, id);
  if (!file) return mobileJson({ error: "File not found" }, { status: 404 });

  await updateFile(user.id, id, { favorite: body.favorite });
  invalidatePrefix(`files:${user.id}:`);
  return mobileJson({ ok: true, favorite: body.favorite });
}
