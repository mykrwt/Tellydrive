import { requireAdmin } from "@/lib/services/admin-guard";
import { adminStats } from "@/lib/services/stats";

export const runtime = "nodejs";

export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ stats: adminStats() });
}
