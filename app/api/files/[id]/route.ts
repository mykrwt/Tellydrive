import { currentUserId } from "@/lib/auth";
import {
  moveFile,
  renameFile,
  softDeleteFile,
} from "@/lib/services/files";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const fileId = Number(id);
  if (!Number.isFinite(fileId)) return Response.json({ error: "Bad request" }, { status: 400 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    if (typeof body.name === "string") renameFile(userId, fileId, body.name);
    if ("folder_id" in body) moveFile(userId, fileId, body.folder_id);
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Failed" }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const fileId = Number(id);
  if (!Number.isFinite(fileId)) return Response.json({ error: "Bad request" }, { status: 400 });
  try {
    softDeleteFile(userId, fileId);
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Failed" }, { status: 400 });
  }
}
