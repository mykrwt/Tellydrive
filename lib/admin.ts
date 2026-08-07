import "server-only";

import { redirect } from "next/navigation";
import { authorizeRequest } from "@/lib/backend-authority";
import type { SafeUser } from "@/lib/auth";
import { isAdminIdentity } from "@/lib/server/admin-identity";

export const isAdminUser = isAdminIdentity;

/** Server-side gate for pages: every request re-evaluates backend authority. */
export async function requireAdmin(): Promise<SafeUser> {
  try {
    return (await authorizeRequest("admin:read")).user;
  } catch (error) {
    if ((error as { status?: number }).status === 401) redirect("/sign-in");
    redirect("/dashboard");
  }
}

/** Server-side gate for actions/APIs: returns null when not allowed. */
export async function getAdminUser(): Promise<SafeUser | null> {
  try {
    return (await authorizeRequest("admin:read")).user;
  } catch {
    return null;
  }
}
