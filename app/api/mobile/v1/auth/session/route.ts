import { deleteSession } from "@/lib/auth";
import { authorityErrorPayload, authorizeRequest } from "@/lib/backend-authority";
import { mobileJson, mobileUser } from "@/app/api/mobile/v1/_shared";

export async function GET() {
  try {
    const principal = await authorizeRequest("account:read");
    return mobileJson({ user: mobileUser(principal.user) });
  } catch (error) {
    const failure = authorityErrorPayload(error);
    return mobileJson(failure.body, { status: failure.status });
  }
}

export async function DELETE() {
  // Sign-out is always available, including during bans or maintenance.
  await deleteSession();
  return mobileJson({ ok: true });
}
