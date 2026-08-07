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

/**
 * The operator floor: accounts listed in ADMIN_EMAILS are the bootstrap
 * administrators. They can never be banned, suspended, demoted, or stripped of
 * storage through any admin channel (web dashboard or Telegram console), so
 * the operator cannot lock themselves out.
 */
export function isOperatorFloorAccount(user: Pick<SafeUser, "email">): boolean {
  const email = user.email.trim().toLowerCase();
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}
