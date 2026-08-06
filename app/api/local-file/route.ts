import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { getFilesForUser } from "@/lib/telegram-store";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return new NextResponse("Missing id", { status: 400 });

  // Validate id format to prevent path traversal
  if (id.includes("/") || id.includes("\\") || id.includes("..")) {
    return new NextResponse("Invalid id", { status: 400 });
  }

  // Verify the file belongs to the user (check both primary and chunks)
  const files = await getFilesForUser(user.id);
  const fileInfo = files.find(
    (f) => f.telegramFileId === `local:${id}` || f.chunks?.some((c) => c.fileId === `local:${id}`)
  );
  if (!fileInfo) return new NextResponse("Forbidden", { status: 403 });

  const filePath = path.join(process.cwd(), ".data", "files", id);
  // Ensure resolved path is inside .data/files
  const safeBase = path.join(process.cwd(), ".data", "files");
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(safeBase))) {
    return new NextResponse("Invalid path", { status: 400 });
  }

  try {
    const content = await readFile(filePath);
    // Determine if inline (for image preview) or attachment
    const isImage = fileInfo.mimeType.startsWith("image/");
    const isVideo = fileInfo.mimeType.startsWith("video/");
    const disposition = isImage || isVideo ? "inline" : "attachment";
    return new NextResponse(content, {
      headers: {
        "Content-Type": fileInfo.mimeType || "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(fileInfo.name)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("File not found", { status: 404 });
  }
}
