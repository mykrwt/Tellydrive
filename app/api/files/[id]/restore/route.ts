import { currentUserId } from "@/lib/auth";
import { restoreFile } from "@/lib/services/files";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const fileId = Number(id);
  if (!Number.isFinite(fileId)) return Response.json({ error: "Bad request" }, { status: 400 });
  try {
    restoreFile(userId, fileId);
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Failed" }, { status: 400 });
  }
}
