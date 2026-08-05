import { requireAdmin } from "@/lib/services/admin-guard";
import { adminDeleteAnnouncement } from "@/lib/services/admin";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin();
  if (!adminId) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  adminDeleteAnnouncement(Number(id));
  return Response.json({ ok: true });
}
