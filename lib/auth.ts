import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/config";
import { getOrCreateUser, type UserRow } from "@/lib/services/users";

/**
 * Returns the current application user (looked up/created in our metadata DB
 * keyed by the Clerk user id), or null when signed out.
 *
 * When Clerk is not configured (missing env keys) this returns null so pages
 * can render a setup notice instead of crashing. Authentication itself is
 * always delegated to Clerk — the app never implements its own auth (PRD §5,
 * Appendix B).
 */
export async function currentUser(): Promise<UserRow | null> {
  if (!isClerkConfigured()) return null;
  try {
    const { userId } = await auth();
    if (!userId) return null;
    return getOrCreateUser(userId);
  } catch {
    return null;
  }
}

export async function currentUserId(): Promise<string | null> {
  if (!isClerkConfigured()) return null;
  try {
    const { userId } = await auth();
    return userId ?? null;
  } catch {
    return null;
  }
}
