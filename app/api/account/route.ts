import { currentUserId } from "@/lib/auth";
import { getUserWithPlan } from "@/lib/services/users";
import { listActivity } from "@/lib/services/activity";
import { storageLabel } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const wp = getUserWithPlan(userId);
  if (!wp) return Response.json({ error: "Not found" }, { status: 404 });
  const activity = listActivity(userId, 10);
  // Don't echo the user's stored Telegram credentials back to the client.
  const safeUser = { ...wp.user } as Record<string, unknown>;
  delete safeUser.tg_bot_token;
  delete safeUser.tg_chat_id;
  return Response.json({
    user: safeUser,
    plan: wp.plan,
    features: JSON.parse(wp.plan.features),
    recentActivity: activity,
    backend: storageLabel(wp.user),
  });
}
