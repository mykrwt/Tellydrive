import { currentUserId } from "@/lib/auth";
import { restoreFolder } from "@/lib/services/folders";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const folderId = Number(id);
  if (!Number.isFinite(folderId)) return Response.json({ error: "Bad request" }, { status: 400 });
  try {
    restoreFolder(userId, folderId);
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Failed" }, { status: 400 });
  }
}
