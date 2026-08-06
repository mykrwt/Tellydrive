"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin";
import { setUserRole } from "@/lib/telegram-store";

export async function setUserRoleAction(userId: string, role: "admin" | "user"): Promise<{ ok: boolean; error?: string }> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Unauthorized" };
  if (!userId || typeof userId !== "string" || !/^[a-zA-Z0-9_-]{6,64}$/.test(userId)) {
    return { ok: false, error: "Invalid user id" };
  }
  if (role !== "admin" && role !== "user") return { ok: false, error: "Invalid role" };
  if (userId === admin.id) return { ok: false, error: "You cannot change your own role." };
  try {
    await setUserRole(userId, role);
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update role" };
  }
  revalidatePath("/dashboard/admin");
  return { ok: true };
}
