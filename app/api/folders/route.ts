import { NextRequest } from "next/server";
import { currentUserId } from "@/lib/auth";
import {
  buildFolderTree,
  createFolder,
  listSubfolders,
} from "@/lib/services/folders";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parentParam = request.nextUrl.searchParams.get("parent_id");
  const parentId =
    parentParam === null ? undefined : parentParam === "" ? null : Number(parentParam);
  if (parentId === undefined) {
    return Response.json({ tree: buildFolderTree(userId) });
  }
  return Response.json({ folders: listSubfolders(userId, parentId) });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    const folder = createFolder(
      userId,
      String(body.name ?? ""),
      body.parent_id ? Number(body.parent_id) : null,
    );
    return Response.json({ folder });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Failed" }, { status: 400 });
  }
}
