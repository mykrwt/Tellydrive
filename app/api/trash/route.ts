import { currentUserId } from "@/lib/auth";
import { emptyTrash, listTrashedFiles } from "@/lib/services/files";
import { listTrashedFolders } from "@/lib/services/folders";

export const runtime = "nodejs";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({
    files: listTrashedFiles(userId),
    folders: listTrashedFolders(userId),
  });
}

export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await emptyTrash(userId);
  return Response.json({ ok: true });
}
