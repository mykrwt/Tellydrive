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
  return Response.json({
    user: wp.user,
    plan: wp.plan,
    features: JSON.parse(wp.plan.features),
    recentActivity: activity,
    backend: storageLabel(),
  });
}
