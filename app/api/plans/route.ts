import { currentUserId } from "@/lib/auth";
import { changeUserPlan, listPlans } from "@/lib/services/plans";
import { getUser } from "@/lib/services/users";

export const runtime = "nodejs";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = getUser(userId);
  return Response.json({
    plans: listPlans(),
    currentPlanId: user?.plan_id,
  });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    const plan = changeUserPlan(userId, Number(body.plan_id));
    return Response.json({ ok: true, plan });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Failed" }, { status: 400 });
  }
}
