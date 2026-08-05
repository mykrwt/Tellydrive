import { requireAdmin } from "@/lib/services/admin-guard";
import { adminCreatePlan } from "@/lib/services/plans";
import { listAllPlans } from "@/lib/services/users";

export const runtime = "nodejs";

export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ plans: listAllPlans() });
}

export async function POST(request: Request) {
  const adminId = await requireAdmin();
  if (!adminId) return Response.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    adminCreatePlan({
      name: String(body.name ?? ""),
      price_monthly: Number(body.price_monthly ?? 0),
      storage_gb: Number(body.storage_gb ?? 0),
      max_upload_mb: Number(body.max_upload_mb ?? 0),
      features: Array.isArray(body.features) ? body.features.map(String) : [],
      is_default: Boolean(body.is_default),
    });
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Failed" }, { status: 400 });
  }
}
