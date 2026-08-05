import { NextRequest } from "next/server";
import { currentUserId } from "@/lib/auth";
import { listFiles, type FileSort } from "@/lib/services/files";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const folderParam = sp.get("folder_id");
  const folderId =
    folderParam === null ? undefined : folderParam === "" ? null : Number(folderParam);
  const search = sp.get("q") ?? undefined;
  const type = (sp.get("type") ?? "all") as "image" | "video" | "all";
  const sort = (sp.get("sort") ?? "newest") as FileSort;

  const files = listFiles({
    userId,
    folderId,
    search,
    type,
    sort,
  });
  return Response.json({ files });
}
