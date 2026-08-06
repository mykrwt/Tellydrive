import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getFileById, getFolderById, removeFile, updateFile } from "@/lib/telegram-store";
import { getStorageFileUrl, getChunkUrls } from "@/lib/telegram-storage";
import { checkRateLimit, checkRateLimitWithIp, getRetryAfterSec, rateLimitHeaders } from "@/lib/rate-limit";
import { sanitizeFileName } from "@/lib/validation";
import { invalidatePrefix } from "@/lib/api-cache";

export const maxDuration = 60;

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.headers.set("Pragma", "no-cache");
  return res;
}

// Absolute origin the BROWSER can reach. req.url may carry the internal bind
// address (e.g. http://0.0.0.0:3000) which is useless in a redirect, so prefer
// the forwarded/host headers set by the reverse proxy or the browser.
function requestOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(req.url).protocol.replace(":", "");
    return `${proto}://${host}`;
  }
  return new URL(req.url).origin;
}

// GET /api/files/[id] — returns file metadata + download URLs (verified owner)
// Or streams file if ?download=1
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return noStore(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

  const { searchParams } = new URL(req.url);
  const download = searchParams.get("download") === "1";
  const thumbnail = searchParams.get("thumbnail") === "1";

  // Validate query params strictly (before doing any work)
  const allowedParams = new Set(["download", "proxy", "thumbnail", "redirect", "inline"]);
  for (const k of searchParams.keys()) {
    if (!allowedParams.has(k)) return noStore(NextResponse.json({ error: "Invalid query param" }, { status: 400 }));
  }

  // Thumbnails/metadata are cheap reads (no bytes streamed here) — keep them
  // off the tight download fuse so media grids render without 429s.
  const bucket = download ? "download" : "preview";
  const dlIp = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    checkRateLimitWithIp(user.id, dlIp, bucket);
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

  const { id } = await params;
  if (!id || typeof id !== "string" || !/^[a-zA-Z0-9_-]{6,64}$/.test(id)) {
    return noStore(NextResponse.json({ error: "Invalid id" }, { status: 400 }));
  }

  const file = await getFileById(user.id, id);
  if (!file) return noStore(NextResponse.json({ error: "File not found" }, { status: 404 }));

  // Thumbnail request: return thumbnail URL if exists, else primary
  if (thumbnail) {
    const thumbId = file.thumbnailFileId || file.telegramFileId;
    try {
      const url = await getStorageFileUrl(thumbId);
      if (searchParams.get("redirect") === "0") {
        return noStore(NextResponse.json({ url }, { headers: { "Cache-Control": "private, max-age=3600" } }));
      }
      // Redirects to Telegram CDN — cache privately for 1h. Resolve relative
      // (local-storage) URLs against this origin or Response.redirect throws.
      const target = url.startsWith("/") ? `${requestOrigin(req)}${url}` : url;
      return NextResponse.redirect(target, { headers: { "Cache-Control": "private, max-age=3600" } } as unknown as ResponseInit);
    } catch {
      return noStore(NextResponse.json({ error: "Could not get thumbnail" }, { status: 500 }));
    }
  }

  if (file.chunked && file.chunks?.length) {
    try {
      const urls = await getChunkUrls(file.chunks);
      if (download && searchParams.get("proxy") === "1") {
        const origin = new URL(req.url).origin;
        const cookie = req.headers.get("cookie") ?? "";
        const targets = urls.map((u) => {
          const sameOrigin = u.startsWith("/");
          return { url: sameOrigin ? `${origin}${u}` : u, sameOrigin };
        });
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              for (const { url, sameOrigin } of targets) {
                const upstream = await fetch(url, {
                  cache: "no-store",
                  headers: sameOrigin && cookie ? { cookie } : undefined,
                });
                if (!upstream.ok || !upstream.body) {
                  throw new Error(`Upstream chunk failed (HTTP ${upstream.status})`);
                }
                const reader = upstream.body.getReader();
                for (;;) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  controller.enqueue(value);
                }
              }
              controller.close();
            } catch (err) {
              controller.error(err);
            }
          },
        });
        const headers = new Headers();
        headers.set("Content-Type", file.mimeType || "application/octet-stream");
        const inline = searchParams.get("inline") === "1";
        // Use inline for viewer playback, attachment for downloads — prevent XSS via mime sniffing
        headers.set("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.name)}"`);
        headers.set("Content-Length", String(file.size));
        headers.set("Accept-Ranges", "none");
        headers.set("Cache-Control", "no-store");
        headers.set("X-Content-Type-Options", "nosniff");
        return new NextResponse(stream, { headers });
      }
      if (download) {
        return noStore(
          NextResponse.json({
            file: {
              id: file.id,
              name: file.name,
              size: file.size,
              mimeType: file.mimeType,
              chunked: true,
              chunkCount: file.chunks.length,
            },
            urls,
          })
        );
      }
      return noStore(
        NextResponse.json({
          id: file.id,
          name: file.name,
          size: file.size,
          mimeType: file.mimeType,
          createdAt: file.createdAt,
          chunked: true,
          urls,
        })
      );
    } catch {
      return noStore(NextResponse.json({ error: "Could not get file URLs" }, { status: 500 }));
    }
  }

  try {
    const url = await getStorageFileUrl(file.telegramFileId);
    if (download) {
      if (searchParams.get("proxy") === "1") {
        const sameOrigin = url.startsWith("/");
        const cookie = req.headers.get("cookie") ?? "";
        // Relative local-storage URLs must be expanded — Node fetch() needs absolute URLs
        const fetchUrl = sameOrigin ? `${new URL(req.url).origin}${url}` : url;
        const upstreamHeaders: Record<string, string> = {};
        if (sameOrigin && cookie) upstreamHeaders.cookie = cookie;
        // Forward HTTP Range so <video> previews start instantly and can seek.
        // Telegram's file endpoint answers with 206 + Content-Range; if it
        // ignores Range we transparently fall back to a full 200 stream.
        const range = req.headers.get("range");
        if (range) upstreamHeaders.range = range;
        const upstream = await fetch(fetchUrl, {
          cache: "no-store",
          headers: Object.keys(upstreamHeaders).length ? upstreamHeaders : undefined,
        });
        if (upstream.status !== 200 && upstream.status !== 206 && upstream.status !== 416) {
          return noStore(NextResponse.json({ error: "Upstream failed" }, { status: 502 }));
        }
        const headers = new Headers();
        headers.set("Content-Type", file.mimeType || "application/octet-stream");
        const inline2 = searchParams.get("inline") === "1";
        headers.set("Content-Disposition", `${inline2 ? "inline" : "attachment"}; filename="${encodeURIComponent(file.name)}"`);
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("Cache-Control", "no-store");
        for (const h of ["Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"]) {
          const v = upstream.headers.get(h);
          if (v) headers.set(h, v);
        }
        return new NextResponse(upstream.body, { status: upstream.status, headers });
      }
      // Redirect to Telegram CDN (resolve relative local-storage URLs first)
      const target = url.startsWith("/") ? `${requestOrigin(req)}${url}` : url;
      return NextResponse.redirect(target, { headers: { "Cache-Control": "private, max-age=3600" } } as unknown as ResponseInit);
    }
    return noStore(
      NextResponse.json({
        id: file.id,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
        createdAt: file.createdAt,
        url,
      })
    );
  } catch {
    return noStore(NextResponse.json({ error: "Could not get file" }, { status: 500 }));
  }
}

// PATCH /api/files/[id] — rename and/or move a file: { name?, folderId? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return noStore(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

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
  const user = await getCurrentUser();
  if (!user) return noStore(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
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
