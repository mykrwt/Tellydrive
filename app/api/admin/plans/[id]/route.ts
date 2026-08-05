import { requireAdmin } from "@/lib/services/admin-guard";
import { adminDeletePlan, adminUpdatePlan } from "@/lib/services/plans";

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
    adminUpdatePlan(Number(id), {
      name: body.name !== undefined ? String(body.name) : undefined,
      price_monthly: body.price_monthly !== undefined ? Number(body.price_monthly) : undefined,
      storage_gb: body.storage_gb !== undefined ? Number(body.storage_gb) : undefined,
      max_upload_mb: body.max_upload_mb !== undefined ? Number(body.max_upload_mb) : undefined,
      features: Array.isArray(body.features) ? body.features.map(String) : undefined,
      is_default: body.is_default !== undefined ? Boolean(body.is_default) : undefined,
      active: body.active !== undefined ? Boolean(body.active) : undefined,
    });
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
  try {
    adminDeletePlan(Number(id));
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Failed" }, { status: 400 });
  }
}
