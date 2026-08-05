import { currentUserId } from "@/lib/auth";
import {
  moveFolder,
  renameFolder,
  softDeleteFolder,
} from "@/lib/services/folders";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const folderId = Number(id);
  if (!Number.isFinite(folderId)) return Response.json({ error: "Bad request" }, { status: 400 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    if (typeof body.name === "string") renameFolder(userId, folderId, body.name);
    if ("parent_id" in body) {
      moveFolder(userId, folderId, body.parent_id ? Number(body.parent_id) : null);
    }
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
  const folderId = Number(id);
  if (!Number.isFinite(folderId)) return Response.json({ error: "Bad request" }, { status: 400 });
  try {
    softDeleteFolder(userId, folderId);
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Failed" }, { status: 400 });
  }
}
