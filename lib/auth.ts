import { auth, currentUser as clerkCurrentUser } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/config";
import { getOrCreateUser, type UserRow } from "@/lib/services/users";

/**
 * Returns the current application user (looked up/created in our metadata DB
 * keyed by the Clerk user id), or null when signed out.
 */
export async function currentUser(): Promise<UserRow | null> {
  if (!isClerkConfigured()) return null;
  try {
    const { userId } = await auth();
    if (!userId) return null;

    let profile: { email?: string; name?: string; image_url?: string } | undefined;
    try {
      const clerkUser = await clerkCurrentUser();
      if (clerkUser) {
        const primaryEmail = clerkUser.emailAddresses?.find(
          (e) => e.id === clerkUser.primaryEmailAddressId,
        )?.emailAddress ?? clerkUser.emailAddresses?.[0]?.emailAddress;
        const fullName = [clerkUser.firstName, clerkUser.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();
        profile = {
          email: primaryEmail || undefined,
          name: fullName || undefined,
          image_url: clerkUser.imageUrl || undefined,
        };
      }
    } catch (e) {
      console.warn("Failed to fetch Clerk profile details:", e);
    }

    return getOrCreateUser(userId, profile);
  } catch (err) {
    console.error("Error in currentUser():", err);
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
