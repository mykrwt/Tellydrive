import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { authorityErrorPayload, authorizeRequest } from "@/lib/backend-authority";
import { getFilesForUser } from "@/lib/telegram-store";
import { checkRateLimit, getRetryAfterSec } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  let user;
  try {
    user = (await authorizeRequest("storage:download")).user;
  } catch (error) {
    const failure = authorityErrorPayload(error);
    return NextResponse.json(failure.body, { status: failure.status, headers: { "Cache-Control": "no-store" } });
  }

  try {
    checkRateLimit(user.id, "download");
  } catch (e: unknown) {
    const resetAt = (e as unknown as { resetAt: number }).resetAt ?? Date.now() + 60000;
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(getRetryAfterSec(resetAt)), "Cache-Control": "no-store" },
    });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return new NextResponse("Missing id", { status: 400, headers: { "Cache-Control": "no-store" } });

  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(id)) {
    return new NextResponse("Invalid id", { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  // Verify the file belongs to the user (check both primary and chunks)
  const files = await getFilesForUser(user.id);
  const fileInfo = files.find(
    (f) => f.telegramFileId === `local:${id}` || f.chunks?.some((c) => c.fileId === `local:${id}`)
  );
  if (!fileInfo) return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });

  const filePath = path.join(process.cwd(), ".data", "files", id);
  const safeBase = path.join(process.cwd(), ".data", "files");
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(safeBase))) {
    return new NextResponse("Invalid path", { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const content = await readFile(filePath);
    // Enforce size check to prevent huge reads
    if (content.length > 50 * 1024 * 1024) {
      return new NextResponse("File too large", { status: 413, headers: { "Cache-Control": "no-store" } });
    }
    const isImage = fileInfo.mimeType.startsWith("image/");
    const isVideo = fileInfo.mimeType.startsWith("video/");
    const disposition = isImage || isVideo ? "inline" : "attachment";
    return new NextResponse(content, {
      headers: {
        "Content-Type": fileInfo.mimeType || "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(fileInfo.name)}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("File not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
