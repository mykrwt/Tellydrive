import { NextRequest, NextResponse } from "next/server";
import { authorityErrorPayload, authorizeRequest } from "@/lib/backend-authority";
import { getFilesPaginated, getFolderById, addFile, type StoredFile } from "@/lib/telegram-store";
import { uploadToStorage, friendlyStorageError } from "@/lib/telegram-storage";
import { sanitizeFileName, sanitizeSearchQuery, validateAnyFileType, validateFileType } from "@/lib/validation";
import { checkRateLimit, checkRateLimitWithIp, getRetryAfterSec, rateLimitHeaders } from "@/lib/rate-limit";
import { cachedFetch, etagMatches, invalidatePrefix } from "@/lib/api-cache";
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

function ipFromReq(req: NextRequest): string {
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

// GET /api/files?limit=24&offset=0&search=&mime=image&sortBy=date&sortOrder=desc
export async function GET(req: NextRequest) {
  let user;
  try {
    user = (await authorizeRequest("storage:read")).user;
  } catch (error) {
    const failure = authorityErrorPayload(error);
    return withSecurity(NextResponse.json(failure.body, { status: failure.status }));
  }

  const ip = ipFromReq(req);
  let rl: ReturnType<typeof checkRateLimit> | null = null;
  try {
    rl = checkRateLimitWithIp(user.id, ip, "list");
  } catch (e: unknown) {
    const r = (e as unknown as { result?: ReturnType<typeof checkRateLimit> }).result;
    const h = r ? rateLimitHeaders(r) : {};
    const resetAt = (e as unknown as { resetAt: number }).resetAt ?? Date.now() + 60000;
    return withSecurity(
      NextResponse.json({ error: e instanceof Error ? e.message : "Too many requests" }, {
        status: 429,
        headers: { ...h, "Retry-After": String(getRetryAfterSec(resetAt)) },
      })
    );
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") || 24)));
  const offset = Math.max(0, Number(searchParams.get("offset") || 0));
  const search = sanitizeSearchQuery(searchParams.get("search") || "");
  const mimeParam = searchParams.get("mime");
  const mime: "image" | "video" | "all" = mimeParam === "image" || mimeParam === "video" ? mimeParam : "all";
  const sortBy = (searchParams.get("sortBy") as "name" | "size" | "date") || "date";
  const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") || "desc";
  const folderIdParam = searchParams.get("folderId");
  const root = searchParams.get("root") === "1";
  const mediaOnly = searchParams.get("media") === "1";
  const sectionParam = searchParams.get("section") as "gallery" | "files" | "admin" | null;
  const excludeGallery = searchParams.get("excludeGallery") === "1" || sectionParam === "files";

  const validSort = new Set(["name", "size", "date"]);
  const safeSortBy = validSort.has(sortBy) ? sortBy : "date";
  const safeSortOrder = sortOrder === "asc" ? "asc" : "desc";

  // Folder scoping: folderId=<id> (specific folder), root=1 (no folder), absent (everywhere)
  if (folderIdParam && !/^[a-zA-Z0-9_-]{6,64}$/.test(folderIdParam)) {
    return withSecurity(NextResponse.json({ error: "Invalid folderId" }, { status: 400 }));
  }
  if (folderIdParam && root) {
    return withSecurity(NextResponse.json({ error: "Use either folderId or root, not both" }, { status: 400 }));
  }
  const folderScope: string | null | undefined = root ? null : folderIdParam ?? undefined;

  // Cache key: user + exact query; TTL 10s, stale-while-revalidate via client
  const cacheKey = `files:${user.id}:${search}:${mime}:${safeSortBy}:${safeSortOrder}:${folderScope === undefined ? "all" : folderScope ?? "root"}:${mediaOnly ? "media" : ""}:${sectionParam || ""}:${excludeGallery ? "exclGal" : ""}:${limit}:${offset}`;
  try {
    const { value, etag, hit } = await cachedFetch(cacheKey, 10_000, async () => {
      const all = await getFilesPaginated(user.id, {
        search,
        mime,
        sortBy: safeSortBy,
        sortOrder: safeSortOrder,
        folderId: folderScope,
        section: sectionParam ?? undefined,
        excludeGallery,
        limit: mediaOnly ? 10000 : limit,
        offset: 0,
      });
      let files = all.files;
      let total = all.total;
      if (mediaOnly) {
        const media = files.filter((f) => f.mimeType.startsWith("image/") || f.mimeType.startsWith("video/"));
        total = media.length;
        files = media.slice(offset, offset + limit);
      }
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
        hasThumbnail: Boolean(f.thumbnailFileId),
      }));
      return { files: safeFiles, total, limit, offset };
    });

    // ETag / 304
    const inm = req.headers.get("if-none-match");
    if (etagMatches(inm, etag)) {
      const headers: Record<string, string> = {
        ETag: etag,
        "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
        "X-Cache": hit ? "HIT" : "MISS",
        ...rateLimitHeaders(rl!),
      };
      return new NextResponse(null, { status: 304, headers });
    }

    const resHeaders: Record<string, string> = {
      ETag: etag,
      "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
      "X-Cache": hit ? "HIT" : "MISS",
      ...rateLimitHeaders(rl!),
    };
    // Override no-store for this GET: allow private caching but still sensitive
    const res = NextResponse.json(value, { headers: resHeaders });
    // Do not apply no-store; instead keep private cache
    return res;
  } catch (err) {
    console.error("GET /api/files cachedFetch error", err);
    return withSecurity(NextResponse.json({ error: "Failed to load" }, { status: 500 }));
  }
}

// POST /api/files — multipart form-data with files[]
export async function POST(req: NextRequest) {
  let principal;
  try {
    principal = await authorizeRequest("storage:upload");
  } catch (error) {
    const failure = authorityErrorPayload(error);
    return withSecurity(NextResponse.json(failure.body, { status: failure.status }));
  }
  const user = principal.user;

  const ip = ipFromReq(req);
  try {
    checkRateLimitWithIp(user.id, ip, "upload");
  } catch (e: unknown) {
    const r = (e as unknown as { result?: ReturnType<typeof checkRateLimit> }).result;
    const h = r ? rateLimitHeaders(r) : {};
    const resetAt = (e as unknown as { resetAt: number }).resetAt ?? Date.now() + 60000;
    return withSecurity(
      NextResponse.json({ error: e instanceof Error ? e.message : "Too many requests" }, {
        status: 429,
        headers: { ...h, "Retry-After": String(getRetryAfterSec(resetAt)) },
      })
    );
  }

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

  // Optional target folder (Files section) + relaxed type allow-list (documents, audio, …)
  const folderIdRaw = form.get("folderId");
  const folderId: string | null =
    folderIdRaw === null || folderIdRaw === "" || folderIdRaw === "root" ? null : String(folderIdRaw);
  if (folderId && !/^[a-zA-Z0-9_-]{6,64}$/.test(folderId)) {
    return withSecurity(NextResponse.json({ error: "Invalid folderId" }, { status: 400 }));
  }
  if (folderId) {
    const folder = await getFolderById(user.id, folderId);
    if (!folder) return withSecurity(NextResponse.json({ error: "Target folder not found" }, { status: 404 }));
  }
  const sourceRaw = form.get("source");
  if (sourceRaw === "admin" && !principal.isAdmin) {
    return withSecurity(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }
  // The client may request a UI section, but the backend maps it to an allowed
  // scope and derives file-type permissions. `allowAny` is intentionally ignored.
  const source: "gallery" | "files" | "admin" =
    sourceRaw === "admin" && principal.isAdmin
      ? "admin"
      : sourceRaw === "files" || folderId
        ? "files"
        : "gallery";
  const allowAny = source !== "gallery";
  const typeCheck = allowAny ? validateAnyFileType : validateFileType;

  for (const f of allFiles) {
    if (f.size > principal.authority.entitlements.maxUploadBytes) {
      return withSecurity(NextResponse.json({ error: "File too large" }, { status: 400 }));
    }
    try {
      sanitizeFileName(f.name);
    } catch {
      return withSecurity(NextResponse.json({ error: `Invalid file name: ${f.name.slice(0, 50)}` }, { status: 400 }));
    }
    const { ok } = typeCheck(f.type || "application/octet-stream", f.name);
    if (!ok) return withSecurity(NextResponse.json({ error: `Unsupported file type: ${f.name.slice(0, 50)}` }, { status: 400 }));
  }

  const results: Array<{ id?: string; name: string; ok: boolean; error?: string }> = [];

  for (const file of allFiles) {
    try {
      const safeName = sanitizeFileName(file.name);
      const result = await uploadToStorage(safeName, file, { allowAny });

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
        folderId,
        source,
        favorite: false,
        trashed: false,
        version: 1,
      };
      await addFile(stored);
      results.push({ id: stored.id, name: safeName, ok: true });
    } catch (err: unknown) {
      console.error("POST /api/files upload error:", err);
      const msg = err instanceof Error ? err.message : "Upload failed";
      const userMsg = msg.includes("Telegram") || msg.includes("Storage") ? friendlyStorageError(msg) : "Upload failed";
      results.push({ name: file.name || "file", ok: false, error: userMsg });
    }
  }

  // Invalidate gallery cache for this user
  invalidatePrefix(`files:${user.id}:`);

  const hasFailures = results.some((r) => !r.ok);
  return withSecurity(NextResponse.json({ results }, { status: hasFailures ? 207 : 201 }));
}
