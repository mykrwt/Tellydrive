import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser, type SafeUser } from "@/lib/auth";

/**
 * Admin identity rules:
 * 1. A stored `role: "admin"` on the account (set via the Admin page).
 * 2. Any account whose email is listed in ADMIN_EMAILS (comma-separated,
 *    case-insensitive) — this is the bootstrap so the first admin can be
 *    configured purely with environment variables.
 */
export function isAdminUser(user: Pick<SafeUser, "id" | "email" | "role">): boolean {
  if (user.role === "admin") return true;
  const emails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return emails.includes(user.email.toLowerCase());
}

/** Server-side gate for pages: redirects non-admins away. */
export async function requireAdmin(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isAdminUser(user)) redirect("/dashboard");
  return user;
}

/** Server-side gate for actions/APIs: returns null when not allowed. */
export async function getAdminUser(): Promise<SafeUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return isAdminUser(user) ? user : null;
}
