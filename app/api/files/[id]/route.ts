import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getFilesForUser, removeFile } from "@/lib/telegram-store";
import { getStorageFileUrl, getChunkUrls } from "@/lib/telegram-storage";
import { checkRateLimit } from "@/lib/rate-limit";

// Vercel: reassembled (chunked) downloads stream through this function.
export const maxDuration = 60;

// GET /api/files/[id] — returns file metadata + download URLs (verified owner)
// Or streams file if ?download=1
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    checkRateLimit(user.id, "download");
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Too many requests" }, { status: 429 });
  }

  const { id } = await params;
  if (!id || typeof id !== "string") return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const files = await getFilesForUser(user.id);
  const file = files.find((f) => f.id === id);
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const download = searchParams.get("download") === "1";
  const thumbnail = searchParams.get("thumbnail") === "1";

  // Thumbnail request: return thumbnail URL if exists, else primary
  if (thumbnail) {
    const thumbId = file.thumbnailFileId || file.telegramFileId;
    try {
      const url = await getStorageFileUrl(thumbId);
      // Redirect to Telegram CDN via server proxy to avoid exposing token?
      // For now we redirect; client will fetch via proxied URL.
      // To avoid exposing token in URL, we could proxy streaming. But for simplicity return URL.
      // Security: URL contains token, but it's scoped to this file and user owns it.
      // Alternative: proxy.
      if (searchParams.get("redirect") === "0") {
        return NextResponse.json({ url });
      }
      return NextResponse.redirect(url);
    } catch {
      return NextResponse.json({ error: "Could not get thumbnail" }, { status: 500 });
    }
  }

  if (file.chunked && file.chunks?.length) {
    try {
      const urls = await getChunkUrls(file.chunks);
      if (download && searchParams.get("proxy") === "1") {
        // Stream all chunks back-to-back as a single body so the client
        // receives the complete original file (videos, large files) instead
        // of a JSON manifest. Chunks are fetched sequentially in order.
        // Same-origin chunk URLs (local dev storage) still require the session
        // cookie, so forward it for relative URLs. Resolve them to absolute now —
        // inside the stream callback the request context is gone.
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
        headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(file.name)}"`);
        headers.set("Content-Length", String(file.size));
        headers.set("Accept-Ranges", "none");
        return new NextResponse(stream, { headers });
      }
      if (download) {
        // Without proxy, return JSON with chunk URLs so client can reassemble.
        return NextResponse.json({
          file: {
            id: file.id,
            name: file.name,
            size: file.size,
            mimeType: file.mimeType,
            chunked: true,
            chunkCount: file.chunks.length,
          },
          urls,
        });
      }
      return NextResponse.json({
        id: file.id,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
        createdAt: file.createdAt,
        chunked: true,
        urls,
      });
    } catch {
      return NextResponse.json({ error: "Could not get file URLs" }, { status: 500 });
    }
  }

  try {
    const url = await getStorageFileUrl(file.telegramFileId);
    if (download) {
      // If ?download=1&proxy=1, we could proxy; for now redirect
      if (searchParams.get("proxy") === "1") {
        // Proxy streaming to hide token and enforce owner check.
        // Same-origin URLs (local dev storage) need the session cookie forwarded.
        const sameOrigin = url.startsWith("/");
        const cookie = req.headers.get("cookie") ?? "";
        const upstream = await fetch(url, {
          cache: "no-store",
          headers: sameOrigin && cookie ? { cookie } : undefined,
        });
        if (!upstream.ok) return NextResponse.json({ error: "Upstream failed" }, { status: 502 });
        const headers = new Headers();
        headers.set("Content-Type", file.mimeType || "application/octet-stream");
        headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(file.name)}"`);
        if (upstream.headers.get("content-length")) headers.set("Content-Length", upstream.headers.get("content-length")!);
        return new NextResponse(upstream.body, { headers });
      }
      return NextResponse.redirect(url);
    }
    return NextResponse.json({
      id: file.id,
      name: file.name,
      size: file.size,
      mimeType: file.mimeType,
      createdAt: file.createdAt,
      url,
    });
  } catch {
    return NextResponse.json({ error: "Could not get file" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    checkRateLimit(user.id, "delete");
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Too many requests" }, { status: 429 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const files = await getFilesForUser(user.id);
  const file = files.find((f) => f.id === id);
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  await removeFile(id, user.id);
  return NextResponse.json({ ok: true });
}
