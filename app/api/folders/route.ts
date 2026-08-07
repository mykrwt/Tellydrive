import { NextRequest, NextResponse } from "next/server";
import { authorityErrorPayload, authorizeRequest } from "@/lib/backend-authority";
import { createFolder, getFilesForUser, getFoldersForUser } from "@/lib/telegram-store";
import { checkRateLimitWithIp, getRetryAfterSec, rateLimitHeaders } from "@/lib/rate-limit";
import { cachedFetch, etagMatches, invalidatePrefix } from "@/lib/api-cache";

export const maxDuration = 60;

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.headers.set("Pragma", "no-cache");
  return res;
}

function ipFromReq(req: NextRequest): string {
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

const FOLDER_ID_RE = /^[a-zA-Z0-9_-]{6,64}$/;

// GET /api/folders?parentId=<id> | root=1 | all=1
export async function GET(req: NextRequest) {
  let user;
  try {
    user = (await authorizeRequest("storage:read")).user;
  } catch (error) {
    const failure = authorityErrorPayload(error);
    return noStore(NextResponse.json(failure.body, { status: failure.status }));
  }

  const ip = ipFromReq(req);
  let rl: ReturnType<typeof checkRateLimitWithIp> | null = null;
  try {
    rl = checkRateLimitWithIp(user.id, ip, "list");
  } catch (e: unknown) {
    const r = (e as unknown as { result?: ReturnType<typeof checkRateLimitWithIp> }).result;
    const h = r ? rateLimitHeaders(r) : {};
    const resetAt = (e as unknown as { resetAt: number }).resetAt ?? Date.now() + 60000;
    return noStore(
      NextResponse.json({ error: e instanceof Error ? e.message : "Too many requests" }, {
        status: 429,
        headers: { ...h, "Retry-After": String(getRetryAfterSec(resetAt)) },
      })
    );
  }

  const { searchParams } = new URL(req.url);
  const parentId = searchParams.get("parentId");
  const root = searchParams.get("root") === "1";
  const all = searchParams.get("all") === "1";

  if (parentId && !FOLDER_ID_RE.test(parentId)) {
    return noStore(NextResponse.json({ error: "Invalid parentId" }, { status: 400 }));
  }
  if ([parentId, root, all].filter(Boolean).length > 1) {
    return noStore(NextResponse.json({ error: "Use exactly one of parentId, root, all" }, { status: 400 }));
  }

  const cacheKey = `folders:${user.id}:${parentId || (root ? "root" : "all")}`;
  try {
    const { value, etag, hit } = await cachedFetch(cacheKey, 10_000, async () => {
      let folders = await getFoldersForUser(user.id, all ? undefined : parentId ? parentId : null);
      folders = folders.sort((a, b) => a.name.localeCompare(b.name));

      // Count direct items inside each folder (files + subfolders) for the UI
      const folderIds = new Set(folders.map((f) => f.id));
      const itemCounts = new Map<string, number>();
      for (const f of folders) itemCounts.set(f.id, 0);
      for (const file of await getFilesForUser(user.id)) {
        if (file.folderId && folderIds.has(file.folderId)) {
          itemCounts.set(file.folderId, (itemCounts.get(file.folderId) ?? 0) + 1);
        }
      }
      // Subfolders: load all owned folders once for the count
      const allFolders = await getFoldersForUser(user.id, undefined);
      for (const f of allFolders) {
        if (f.parentId && folderIds.has(f.parentId)) {
          itemCounts.set(f.parentId, (itemCounts.get(f.parentId) ?? 0) + 1);
        }
      }

      const safeFolders = folders.map((f) => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        createdAt: f.createdAt,
        itemCount: itemCounts.get(f.id) ?? 0,
      }));
      return { folders: safeFolders };
    });

    const inm = req.headers.get("if-none-match");
    if (etagMatches(inm, etag)) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, max-age=10, stale-while-revalidate=30", "X-Cache": hit ? "HIT" : "MISS", ...rateLimitHeaders(rl!) },
      });
    }
    return NextResponse.json(value, {
      headers: { ETag: etag, "Cache-Control": "private, max-age=10, stale-while-revalidate=30", "X-Cache": hit ? "HIT" : "MISS", ...rateLimitHeaders(rl!) },
    });
  } catch (err) {
    console.error("GET /api/folders error", err);
    return noStore(NextResponse.json({ error: "Failed to load folders" }, { status: 500 }));
  }
}

// POST /api/folders — { name, parentId }
export async function POST(req: NextRequest) {
  let user;
  try {
    user = (await authorizeRequest("storage:write")).user;
  } catch (error) {
    const failure = authorityErrorPayload(error);
    return noStore(NextResponse.json(failure.body, { status: failure.status }));
  }

  const ip = ipFromReq(req);
  try {
    checkRateLimitWithIp(user.id, ip, "folder");
  } catch (e: unknown) {
    const r = (e as unknown as { result?: ReturnType<typeof checkRateLimitWithIp> }).result;
    const h = r ? rateLimitHeaders(r) : {};
    const resetAt = (e as unknown as { resetAt: number }).resetAt ?? Date.now() + 60000;
    return noStore(
      NextResponse.json({ error: e instanceof Error ? e.message : "Too many requests" }, {
        status: 429,
        headers: { ...h, "Retry-After": String(getRetryAfterSec(resetAt)) },
      })
    );
  }

  // CSRF: require same-origin
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin) {
    try {
      const o = new URL(origin);
      if (o.host !== host && o.host !== req.headers.get("x-forwarded-host")) {
        return noStore(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
      }
    } catch {
      return noStore(NextResponse.json({ error: "Invalid origin" }, { status: 400 }));
    }
  }

  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return noStore(NextResponse.json({ error: "Invalid content type" }, { status: 400 }));
  }

  let body: { name?: unknown; parentId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return noStore(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }));
  }

  const parentIdRaw = body.parentId === null || body.parentId === undefined ? null : String(body.parentId);
  if (parentIdRaw && !FOLDER_ID_RE.test(parentIdRaw)) {
    return noStore(NextResponse.json({ error: "Invalid parent folder" }, { status: 400 }));
  }

  try {
    const folder = await createFolder(user.id, String(body.name ?? ""), parentIdRaw);
    invalidatePrefix(`folders:${user.id}:`);
    invalidatePrefix(`files:${user.id}:`);
    return noStore(NextResponse.json({ folder }, { status: 201 }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Could not create folder";
    const status = msg.toLowerCase().includes("not found") ? 404 : 400;
    return noStore(NextResponse.json({ error: msg }, { status }));
  }
}
