import { requireAdmin } from "@/lib/services/admin-guard";
import { setMaintenanceMode } from "@/lib/services/admin";
import { setRecycleRetention } from "@/lib/services/plans";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const adminId = await requireAdmin();
  if (!adminId) return Response.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof body.maintenance === "boolean") setMaintenanceMode(body.maintenance);
  if (typeof body.recycle_days === "number") setRecycleRetention(body.recycle_days);
  return Response.json({ ok: true });
}
