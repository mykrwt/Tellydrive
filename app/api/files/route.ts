import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getFilesPaginated, addFile, type StoredFile } from "@/lib/telegram-store";
import { uploadToStorage } from "@/lib/telegram-storage";
import { sanitizeFileName, sanitizeSearchQuery } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { randomUUID } from "node:crypto";

// GET /api/files?limit=24&offset=0&search=&mime=image&sortBy=date&sortOrder=desc&view=gallery
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    checkRateLimit(user.id, "list");
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 24)));
  const offset = Math.max(0, Number(searchParams.get("offset") || 0));
  const search = sanitizeSearchQuery(searchParams.get("search") || "");
  const mimeParam = searchParams.get("mime");
  const mime: "image" | "video" | "all" = mimeParam === "image" || mimeParam === "video" ? mimeParam : "all";
  const sortBy = (searchParams.get("sortBy") as "name" | "size" | "date") || "date";
  const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") || "desc";
  const folderId = searchParams.get("folderId");

  // Validate sortBy
  const validSort = new Set(["name", "size", "date"]);
  const safeSortBy = validSort.has(sortBy) ? sortBy : "date";
  const safeSortOrder = sortOrder === "asc" ? "asc" : "desc";

  const { files, total } = await getFilesPaginated(user.id, {
    search,
    mime,
    sortBy: safeSortBy,
    sortOrder: safeSortOrder,
    folderId: folderId ?? undefined,
    limit,
    offset,
  });

  // Never expose internal telegram tokens or sensitive fields
  const safeFiles = files.map((f) => ({
    id: f.id,
    name: f.name,
    size: f.size,
    mimeType: f.mimeType,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    chunked: f.chunked,
    folderId: f.folderId,
    favorite: f.favorite,
    width: f.width,
    height: f.height,
    duration: f.duration,
    // For gallery thumbnails, client will request /api/files/[id]/thumbnail which verifies ownership
    hasThumbnail: Boolean(f.thumbnailFileId),
  }));

  return NextResponse.json({ files: safeFiles, total, limit, offset });
}

// POST /api/files — multipart form-data with files[]
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    checkRateLimit(user.id, "upload");
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Too many requests" }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const files = form.getAll("files") as File[];
  const single = form.get("file") as File | null;
  const allFiles: File[] = [];
  if (single) allFiles.push(single);
  allFiles.push(...files.filter(Boolean));

  if (!allFiles.length) return NextResponse.json({ error: "No files provided" }, { status: 400 });
  if (allFiles.length > 20) return NextResponse.json({ error: "Too many files (max 20)" }, { status: 400 });

  const results: Array<{ id?: string; name: string; ok: boolean; error?: string }> = [];

  for (const file of allFiles) {
    try {
      const safeName = sanitizeFileName(file.name);
      // Store the uploaded File/Blob unchanged. uploadToStorage sends it as a Telegram
      // document, so images/videos are saved at the original resolution and quality.
      const result = await uploadToStorage(safeName, file, {});

      const stored: StoredFile = {
        id: randomUUID(),
        userId: user.id,
        name: safeName,
        telegramFileId: result.fileId,
        telegramMessageId: result.messageId,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        chunked: result.chunked,
        chunkSize: result.chunkSize,
        chunkCount: result.chunkCount,
        chunks: result.chunks,
        folderId: null,
        favorite: false,
        trashed: false,
        version: 1,
      };
      await addFile(stored);
      results.push({ id: stored.id, name: safeName, ok: true });
    } catch (err: unknown) {
      console.error("POST /api/files upload error:", err);
      const msg = err instanceof Error ? err.message : "Upload failed";
      // Generic error to client, detailed logs server-side
      const userMsg = msg.includes("Telegram") || msg.includes("Storage") ? "Something went wrong. Please try again." : msg;
      results.push({ name: file.name || "file", ok: false, error: userMsg });
    }
  }

  // If single file, return 201 with file info; if batch, return array
  const hasFailures = results.some((r) => !r.ok);
  return NextResponse.json({ results }, { status: hasFailures ? 207 : 201 });
}
