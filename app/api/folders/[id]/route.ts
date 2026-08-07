import { NextRequest, NextResponse } from "next/server";
import { authorityErrorPayload, authorizeRequest } from "@/lib/backend-authority";
import {
  getFolderById,
  getFolderPath,
  moveFolder,
  removeFolder,
  renameFolder,
} from "@/lib/telegram-store";
import { checkRateLimitWithIp, getRetryAfterSec, rateLimitHeaders } from "@/lib/rate-limit";
import { invalidatePrefix } from "@/lib/api-cache";

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

// GET /api/folders/[id] — folder + breadcrumb path
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = (await authorizeRequest("storage:read")).user;
  } catch (error) {
    const failure = authorityErrorPayload(error);
    return noStore(NextResponse.json(failure.body, { status: failure.status }));
  }
  const { id } = await params;
  if (!FOLDER_ID_RE.test(id)) return noStore(NextResponse.json({ error: "Invalid id" }, { status: 400 }));

  const folder = await getFolderById(user.id, id);
  if (!folder) return noStore(NextResponse.json({ error: "Folder not found" }, { status: 404 }));
  const path = await getFolderPath(user.id, id);
  return noStore(
    NextResponse.json({
      folder: { id: folder.id, name: folder.name, parentId: folder.parentId, createdAt: folder.createdAt },
      path: path.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, createdAt: f.createdAt })),
    })
  );
}

// PATCH /api/folders/[id] — rename and/or move: { name?, parentId? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  if (!FOLDER_ID_RE.test(id)) return noStore(NextResponse.json({ error: "Invalid id" }, { status: 400 }));

  let body: { name?: unknown; parentId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return noStore(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }));
  }

  const hasName = typeof body.name === "string";
  const hasParent = "parentId" in body;
  if (!hasName && !hasParent) return noStore(NextResponse.json({ error: "Nothing to update" }, { status: 400 }));

  try {
    if (hasName) {
      await renameFolder(user.id, id, body.name as string);
    }
    if (hasParent) {
      const newParent = body.parentId === null ? null : String(body.parentId);
      if (newParent && !FOLDER_ID_RE.test(newParent)) {
        return noStore(NextResponse.json({ error: "Invalid destination folder" }, { status: 400 }));
      }
      await moveFolder(user.id, id, newParent);
    }
    invalidatePrefix(`folders:${user.id}:`);
    invalidatePrefix(`files:${user.id}:`);
    const folder = await getFolderById(user.id, id);
    return noStore(
      NextResponse.json({
        folder: folder ? { id: folder.id, name: folder.name, parentId: folder.parentId, createdAt: folder.createdAt } : null,
      })
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Could not update folder";
    const status = msg.toLowerCase().includes("not found") ? 404 : 400;
    return noStore(NextResponse.json({ error: msg }, { status }));
  }
}

// DELETE /api/folders/[id] — recursive delete; contained files move up to parent
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  if (!FOLDER_ID_RE.test(id)) return noStore(NextResponse.json({ error: "Invalid id" }, { status: 400 }));

  try {
    const { movedFiles } = await removeFolder(user.id, id);
    invalidatePrefix(`folders:${user.id}:`);
    invalidatePrefix(`files:${user.id}:`);
    return noStore(NextResponse.json({ ok: true, movedFiles }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Could not delete folder";
    const status = msg.toLowerCase().includes("not found") ? 404 : 500;
    return noStore(NextResponse.json({ error: msg }, { status }));
  }
}
