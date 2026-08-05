import { currentUserId } from "@/lib/auth";
import { getUser } from "@/lib/services/users";

/** Returns the user id only when the caller is an admin, else null. */
export async function requireAdmin(): Promise<string | null> {
  const id = await currentUserId();
  if (!id) return null;
  const user = getUser(id);
  return user?.is_admin ? id : null;
}
