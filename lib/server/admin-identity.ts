import "server-only";

import type { SafeUser } from "@/lib/auth";

/** Backend-only administrator identity policy. */
export function isAdminIdentity(user: Pick<SafeUser, "id" | "email" | "role">): boolean {
  if (user.role === "admin") return true;
  const emails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return emails.includes(user.email.toLowerCase());
}
