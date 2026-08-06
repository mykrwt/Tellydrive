import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getFilesPaginated, addFile, type StoredFile } from "@/lib/telegram-store";
import { uploadToStorage, friendlyStorageError } from "@/lib/telegram-storage";
import { sanitizeFileName, sanitizeSearchQuery, validateFileType } from "@/lib/validation";
import { checkRateLimit, getRetryAfterSec } from "@/lib/rate-limit";
import { randomUUID } from "node:crypto";

// Vercel: allow long-running uploads/streaming responses.
export const maxDuration = 60;

function noStoreHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    Pragma: "no-cache",
  };
}

function withSecurity(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(noStoreHeaders())) res.headers.set(k, v);
  return res;
}

// GET /api/files?limit=24&offset=0&search=&mime=image&sortBy=date&sortOrder=desc&view=gallery
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return withSecurity(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

  try {
    const r = checkRateLimit(user.id, "list");
    // Add rate-limit headers
    const resHeaders = {
      "X-RateLimit-Remaining": String(r.remaining),
      "X-RateLimit-Reset": String(Math.ceil(r.resetAt / 1000)),
    };
    // Continue to handle request; attach headers later
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

    // Validate folderId if present (prevent injection)
    if (folderId && !/^[a-zA-Z0-9_-]{1,64}$/.test(folderId)) {
      return withSecurity(NextResponse.json({ error: "Invalid folderId" }, { status: 400 }));
    }

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

    const res = NextResponse.json({ files: safeFiles, total, limit, offset }, { headers: resHeaders });
    return withSecurity(res);
  } catch (e: unknown) {
    const isRate = e instanceof Error && (e as unknown as { status?: number }).status === 429;
    if (isRate) {
      const resetAt = (e as unknown as { resetAt: number }).resetAt ?? Date.now() + 60000;
      return withSecurity(
        NextResponse.json({ error: e instanceof Error ? e.message : "Too many requests" }, {
          status: 429,
          headers: { "Retry-After": String(getRetryAfterSec(resetAt)) },
        })
      );
    }
    return withSecurity(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }
}

// POST /api/files — multipart form-data with files[]
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return withSecurity(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

  try {
    checkRateLimit(user.id, "upload");
  } catch (e: unknown) {
    const resetAt = (e as unknown as { resetAt: number }).resetAt ?? Date.now() + 60000;
    return withSecurity(
      NextResponse.json({ error: e instanceof Error ? e.message : "Too many requests" }, {
        status: 429,
        headers: { "Retry-After": String(getRetryAfterSec(resetAt)) },
      })
    );
  }

  // Enforce same-origin for uploads
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin) {
    try {
      const o = new URL(origin);
      if (o.host !== host && o.host !== req.headers.get("x-forwarded-host")) {
        return withSecurity(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
      }
    } catch {
      return withSecurity(NextResponse.json({ error: "Invalid origin" }, { status: 400 }));
    }
  }

  // Enforce content-type multipart
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) {
    return withSecurity(NextResponse.json({ error: "Invalid content type" }, { status: 400 }));
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return withSecurity(NextResponse.json({ error: "Invalid form data" }, { status: 400 }));
  }

  const files = form.getAll("files") as File[];
  const single = form.get("file") as File | null;
  const allFiles: File[] = [];
  if (single) allFiles.push(single);
  allFiles.push(...files.filter(Boolean));

  if (!allFiles.length) return withSecurity(NextResponse.json({ error: "No files provided" }, { status: 400 }));
  if (allFiles.length > 20) return withSecurity(NextResponse.json({ error: "Too many files (max 20)" }, { status: 400 }));

  // Validate each file before processing to fail fast on malicious payloads
  for (const f of allFiles) {
    if (f.size > 2 * 1024 * 1024 * 1024) return withSecurity(NextResponse.json({ error: "File too large" }, { status: 400 }));
    // Block empty or suspicious names early
    try {
      sanitizeFileName(f.name);
    } catch {
      return withSecurity(NextResponse.json({ error: `Invalid file name: ${f.name.slice(0, 50)}` }, { status: 400 }));
    }
    const { ok } = validateFileType(f.type || "application/octet-stream", f.name);
    if (!ok) return withSecurity(NextResponse.json({ error: `Unsupported file type: ${f.name.slice(0, 50)}` }, { status: 400 }));
  }

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
      // Generic errors to client, detailed logs server-side
      const userMsg = msg.includes("Telegram") || msg.includes("Storage") ? friendlyStorageError(msg) : "Upload failed";
      results.push({ name: file.name || "file", ok: false, error: userMsg });
    }
  }

  // If single file, return 201 with file info; if batch, return array
  const hasFailures = results.some((r) => !r.ok);
  return withSecurity(NextResponse.json({ results }, { status: hasFailures ? 207 : 201 }));
}
