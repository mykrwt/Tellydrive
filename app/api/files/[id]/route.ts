import { NextRequest, NextResponse } from "next/server";
import { authorityErrorPayload, authorizeRequest } from "@/lib/backend-authority";
import { getFileById, getFolderById, removeFile, updateFile } from "@/lib/telegram-store";
import {
  resolvePrivateChunkUrls,
  resolvePrivateStorageFileUrl,
} from "@/lib/telegram-storage";
import { checkRateLimit, checkRateLimitWithIp, getRetryAfterSec, rateLimitHeaders } from "@/lib/rate-limit";
import { sanitizeFileName } from "@/lib/validation";
import { invalidatePrefix } from "@/lib/api-cache";

export const maxDuration = 60;

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.headers.set("Pragma", "no-cache");
  return res;
}

function requestOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(req.url).protocol.replace(":", "");
    return `${proto}://${host}`;
  }
  return new URL(req.url).origin;
}

/**
 * Expand a private backend upstream. Telegram URLs can embed a System A bot
 * token and are therefore consumed only by server-side fetch().
 */
function privateUpstream(req: NextRequest, value: string): { url: string; sameOrigin: boolean } {
  const sameOrigin = value.startsWith("/");
  return {
    url: sameOrigin ? `${requestOrigin(req)}${value}` : value,
    sameOrigin,
  };
}

async function fetchPrivateUpstream(req: NextRequest, value: string, forwardRange: boolean): Promise<Response> {
  const target = privateUpstream(req, value);
  const headers: Record<string, string> = {};
  if (target.sameOrigin) {
    const cookie = req.headers.get("cookie");
    if (cookie) headers.cookie = cookie;
  }
  if (forwardRange) {
    const range = req.headers.get("range");
    if (range) headers.range = range;
  }
  return fetch(target.url, {
    cache: "no-store",
    headers: Object.keys(headers).length ? headers : undefined,
  });
}

function safeStreamHeaders(
  upstream: Response,
  fallbackMime: string,
  fileName: string,
  inline: boolean,
): Headers {
  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") || fallbackMime || "application/octet-stream");
  headers.set("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(fileName)}"`);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  for (const name of ["Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

async function proxySingleFile(
  req: NextRequest,
  upstreamUrl: string,
  file: { name: string; mimeType: string },
  inline: boolean,
  forwardRange: boolean,
): Promise<NextResponse> {
  const upstream = await fetchPrivateUpstream(req, upstreamUrl, forwardRange);
  if (![200, 206, 416].includes(upstream.status)) {
    return noStore(NextResponse.json({ error: "Upstream storage failed" }, { status: 502 }));
  }
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: safeStreamHeaders(upstream, file.mimeType, file.name, inline),
  });
}

// GET /api/files/[id] — metadata or a backend-proxied byte stream.
// System A URLs and Telegram storage IDs are never returned or redirected to.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { searchParams } = new URL(req.url);
  const download = searchParams.get("download") === "1";
  const thumbnail = searchParams.get("thumbnail") === "1";
  const inline = thumbnail || searchParams.get("inline") === "1";
  let user;
  try {
    user = (await authorizeRequest(download || thumbnail ? "storage:download" : "storage:read")).user;
  } catch (error) {
    const failure = authorityErrorPayload(error);
    return noStore(NextResponse.json(failure.body, { status: failure.status }));
  }

  // proxy/redirect remain accepted for backward compatibility but cannot alter
  // the invariant that bytes always pass through this authenticated backend.
  const allowedParams = new Set(["download", "proxy", "thumbnail", "redirect", "inline"]);
  for (const key of searchParams.keys()) {
    if (!allowedParams.has(key)) return noStore(NextResponse.json({ error: "Invalid query param" }, { status: 400 }));
  }

  const bucket = download ? "download" : "preview";
  const requestIp = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    checkRateLimitWithIp(user.id, requestIp, bucket);
  } catch (error: unknown) {
    const result = (error as { result?: ReturnType<typeof checkRateLimit> }).result;
    const resetAt = (error as { resetAt?: number }).resetAt ?? Date.now() + 60_000;
    return noStore(
      NextResponse.json(
        { error: error instanceof Error ? error.message : "Too many requests" },
        {
          status: 429,
          headers: {
            ...(result ? rateLimitHeaders(result) : {}),
            "Retry-After": String(getRetryAfterSec(resetAt)),
          },
        },
      ),
    );
  }

  const { id } = await params;
  if (!id || !/^[a-zA-Z0-9_-]{6,64}$/.test(id)) {
    return noStore(NextResponse.json({ error: "Invalid id" }, { status: 400 }));
  }

  const file = await getFileById(user.id, id);
  if (!file) return noStore(NextResponse.json({ error: "File not found" }, { status: 404 }));

  try {
    if (thumbnail) {
      const privateUrl = await resolvePrivateStorageFileUrl(file.thumbnailFileId || file.telegramFileId);
      return await proxySingleFile(req, privateUrl, file, true, false);
    }

    if (download && file.chunked && file.chunks?.length) {
      const privateUrls = await resolvePrivateChunkUrls(file.chunks);
      const targets = privateUrls.map((value) => privateUpstream(req, value));
      const cookie = req.headers.get("cookie") ?? "";
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for (const target of targets) {
              const upstream = await fetch(target.url, {
                cache: "no-store",
                headers: target.sameOrigin && cookie ? { cookie } : undefined,
              });
              if (!upstream.ok || !upstream.body) throw new Error("Private storage chunk unavailable");
              const reader = upstream.body.getReader();
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });
      const headers = new Headers({
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.name)}"`,
        "Content-Length": String(file.size),
        "Accept-Ranges": "none",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      return new NextResponse(stream, { headers });
    }

    if (download) {
      const privateUrl = await resolvePrivateStorageFileUrl(file.telegramFileId);
      return await proxySingleFile(req, privateUrl, file, inline, true);
    }

    // Metadata contains only application-level identifiers and a same-origin
    // path. Internal storage IDs, channel IDs, and upstream URLs stay private.
    return noStore(
      NextResponse.json({
        id: file.id,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
        createdAt: file.createdAt,
        chunked: Boolean(file.chunked),
        chunkCount: file.chunked ? file.chunks?.length ?? file.chunkCount : undefined,
        contentPath: `/api/files/${encodeURIComponent(file.id)}?download=1&proxy=1&inline=1`,
      }),
    );
  } catch (error) {
    console.error("Private file proxy failed:", error instanceof Error ? error.message : "unknown error");
    return noStore(NextResponse.json({ error: "Could not load file" }, { status: 502 }));
  }
}

// PATCH /api/files/[id] — rename and/or move a file: { name?, folderId? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = (await authorizeRequest("storage:write")).user;
  } catch (error) {
    const failure = authorityErrorPayload(error);
    return noStore(NextResponse.json(failure.body, { status: failure.status }));
  }

  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    checkRateLimitWithIp(user.id, ip, "folder");
  } catch (e: unknown) {
    const r = (e as unknown as { result?: ReturnType<typeof checkRateLimit> }).result;
    const h = r ? rateLimitHeaders(r) : {};
    const resetAt = (e as unknown as { resetAt: number }).resetAt ?? Date.now() + 60000;
    return noStore(
      NextResponse.json({ error: e instanceof Error ? e.message : "Too many requests" }, {
        status: 429,
        headers: { ...h, "Retry-After": String(getRetryAfterSec(resetAt)) },
      })
    );
  }

  // CSRF: same-origin
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
  if (!id || !/^[a-zA-Z0-9_-]{6,64}$/.test(id)) return noStore(NextResponse.json({ error: "Invalid id" }, { status: 400 }));

  let body: { name?: unknown; folderId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return noStore(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }));
  }

  const hasName = typeof body.name === "string";
  const hasFolder = "folderId" in body;
  if (!hasName && !hasFolder) return noStore(NextResponse.json({ error: "Nothing to update" }, { status: 400 }));

  const patch: { name?: string; folderId?: string | null } = {};
  if (hasName) {
    try {
      patch.name = sanitizeFileName(body.name as string);
    } catch {
      return noStore(NextResponse.json({ error: "Invalid file name" }, { status: 400 }));
    }
  }
  if (hasFolder) {
    const folderId = body.folderId === null ? null : String(body.folderId);
    if (folderId && !/^[a-zA-Z0-9_-]{6,64}$/.test(folderId)) {
      return noStore(NextResponse.json({ error: "Invalid destination folder" }, { status: 400 }));
    }
    if (folderId) {
      const folder = await getFolderById(user.id, folderId);
      if (!folder) return noStore(NextResponse.json({ error: "Destination folder not found" }, { status: 404 }));
    }
    patch.folderId = folderId;
  }

  try {
    await updateFile(user.id, id, patch);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Could not update file";
    const status = msg.toLowerCase().includes("not found") ? 404 : 400;
    return noStore(NextResponse.json({ error: msg }, { status }));
  }
  invalidatePrefix(`files:${user.id}:`);
  invalidatePrefix(`folders:${user.id}:`);
  return noStore(NextResponse.json({ ok: true }));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = (await authorizeRequest("storage:write")).user;
  } catch (error) {
    const failure = authorityErrorPayload(error);
    return noStore(NextResponse.json(failure.body, { status: failure.status }));
  }
  const delIp = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    checkRateLimitWithIp(user.id, delIp, "delete");
  } catch (e: unknown) {
    const r = (e as unknown as { result?: ReturnType<typeof checkRateLimit> }).result;
    const h = r ? rateLimitHeaders(r) : {};
    const resetAt = (e as unknown as { resetAt: number }).resetAt ?? Date.now() + 60000;
    return noStore(
      NextResponse.json({ error: e instanceof Error ? e.message : "Too many requests" }, {
        status: 429,
        headers: { ...h, "Retry-After": String(getRetryAfterSec(resetAt)) },
      })
    );
  }
  // CSRF: require same-origin for DELETE
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
  if (!id || !/^[a-zA-Z0-9_-]{6,64}$/.test(id)) return noStore(NextResponse.json({ error: "Invalid id" }, { status: 400 }));

  const file = await getFileById(user.id, id);
  if (!file) return noStore(NextResponse.json({ error: "File not found" }, { status: 404 }));

  await removeFile(id, user.id);
  invalidatePrefix(`files:${user.id}:`);
  return noStore(NextResponse.json({ ok: true }));
}
