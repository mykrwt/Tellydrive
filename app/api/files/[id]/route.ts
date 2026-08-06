import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getFilesForUser, removeFile } from "@/lib/telegram-store";
import { getStorageFileUrl, getChunkUrls } from "@/lib/telegram-storage";
import { checkRateLimit, getRetryAfterSec } from "@/lib/rate-limit";

export const maxDuration = 60;

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.headers.set("Pragma", "no-cache");
  return res;
}

// GET /api/files/[id] — returns file metadata + download URLs (verified owner)
// Or streams file if ?download=1
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return noStore(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  try {
    checkRateLimit(user.id, "download");
  } catch (e: unknown) {
    const resetAt = (e as unknown as { resetAt: number }).resetAt ?? Date.now() + 60000;
    return noStore(
      NextResponse.json({ error: e instanceof Error ? e.message : "Too many requests" }, {
        status: 429,
        headers: { "Retry-After": String(getRetryAfterSec(resetAt)) },
      })
    );
  }

  const { id } = await params;
  if (!id || typeof id !== "string" || !/^[a-zA-Z0-9_-]{6,64}$/.test(id)) {
    return noStore(NextResponse.json({ error: "Invalid id" }, { status: 400 }));
  }

  const files = await getFilesForUser(user.id);
  const file = files.find((f) => f.id === id);
  if (!file) return noStore(NextResponse.json({ error: "File not found" }, { status: 404 }));

  const { searchParams } = new URL(req.url);
  const download = searchParams.get("download") === "1";
  const thumbnail = searchParams.get("thumbnail") === "1";

  // Validate query params strictly
  const allowedParams = new Set(["download", "proxy", "thumbnail", "redirect", "inline"]);
  for (const k of searchParams.keys()) {
    if (!allowedParams.has(k)) return noStore(NextResponse.json({ error: "Invalid query param" }, { status: 400 }));
  }

  // Thumbnail request: return thumbnail URL if exists, else primary
  if (thumbnail) {
    const thumbId = file.thumbnailFileId || file.telegramFileId;
    try {
      const url = await getStorageFileUrl(thumbId);
      if (searchParams.get("redirect") === "0") {
        return noStore(NextResponse.json({ url }, { headers: { "Cache-Control": "private, max-age=3600" } }));
      }
      // Redirects to Telegram CDN — cache privately for 1h (still requires Telegram token)
      return NextResponse.redirect(url, { headers: { "Cache-Control": "private, max-age=3600" } } as unknown as ResponseInit);
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
        const upstream = await fetch(url, {
          cache: "no-store",
          headers: sameOrigin && cookie ? { cookie } : undefined,
        });
        if (!upstream.ok) return noStore(NextResponse.json({ error: "Upstream failed" }, { status: 502 }));
        const headers = new Headers();
        headers.set("Content-Type", file.mimeType || "application/octet-stream");
        const inline2 = searchParams.get("inline") === "1";
        headers.set("Content-Disposition", `${inline2 ? "inline" : "attachment"}; filename="${encodeURIComponent(file.name)}"`);
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("Cache-Control", "no-store");
        if (upstream.headers.get("content-length")) headers.set("Content-Length", upstream.headers.get("content-length")!);
        return new NextResponse(upstream.body, { headers });
      }
      // Redirect to Telegram CDN
      return NextResponse.redirect(url, { headers: { "Cache-Control": "private, max-age=3600" } } as unknown as ResponseInit);
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return noStore(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  try {
    checkRateLimit(user.id, "delete");
  } catch (e: unknown) {
    const resetAt = (e as unknown as { resetAt: number }).resetAt ?? Date.now() + 60000;
    return noStore(
      NextResponse.json({ error: e instanceof Error ? e.message : "Too many requests" }, {
        status: 429,
        headers: { "Retry-After": String(getRetryAfterSec(resetAt)) },
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

  const files = await getFilesForUser(user.id);
  const file = files.find((f) => f.id === id);
  if (!file) return noStore(NextResponse.json({ error: "File not found" }, { status: 404 }));

  await removeFile(id, user.id);
  return noStore(NextResponse.json({ ok: true }));
}
