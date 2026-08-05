import { requireAdmin } from "@/lib/services/admin-guard";
import {
  adminDeleteUser,
  adminSetPlan,
  adminSetSuspended,
} from "@/lib/services/admin";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin();
  if (!adminId) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    if (typeof body.plan_id === "number") adminSetPlan(id, body.plan_id);
    if (typeof body.suspended === "boolean") adminSetSuspended(id, body.suspended);
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Failed" }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin();
  if (!adminId) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  adminDeleteUser(id);
  return Response.json({ ok: true });
}
