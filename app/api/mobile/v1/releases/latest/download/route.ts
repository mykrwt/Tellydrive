import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { authorityErrorPayload, authorizeRequest } from "@/lib/backend-authority";
import { getLatestPublishedRelease } from "@/lib/telegram-store";
import { resolvePrivateChunkUrls, resolvePrivateStorageFileUrl } from "@/lib/telegram-storage";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
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
 * Authenticated APK download for the currently published release. Bytes are
 * streamed through this backend — Telegram storage URLs and file IDs are never
 * returned to the client.
 */
export async function GET(request: NextRequest) {
  try {
    const principal = await authorizeRequest("account:read");
    checkRateLimit(principal.user.id, "download");
  } catch (error) {
    if ((error as { status?: number }).status === 429) {
      return noStore(NextResponse.json({ error: "Too many requests. Try again soon." }, { status: 429 }));
    }
    const failure = authorityErrorPayload(error);
    return noStore(NextResponse.json(failure.body, { status: failure.status }));
  }

  try {
    const release = await getLatestPublishedRelease();
    if (!release) {
      return noStore(NextResponse.json({ error: "No published release yet." }, { status: 404 }));
    }

    const fileName = release.fileName || `tellybase-v${release.versionName}.apk`;
    const headers = new Headers({
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Content-Length": String(release.size),
      "Accept-Ranges": "none",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    });

    // Local development storage (no Telegram configured): the bytes live in
    // .data/files/<id> and are not user-owned, so read them directly.
    if (release.storageFileId.startsWith("local:")) {
      const localId = release.storageFileId.slice(6);
      if (!/^[a-zA-Z0-9_-]{6,64}$/.test(localId)) {
        throw new Error("Invalid local storage id.");
      }
      const bytes = await readFile(path.join(process.cwd(), ".data", "files", localId));
      return new NextResponse(new Uint8Array(bytes), { headers });
    }

    if (release.storageChunked && release.storageChunks?.length) {
      const privateUrls = await resolvePrivateChunkUrls(release.storageChunks);
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for (const value of privateUrls) {
              const upstream = await fetch(value, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
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
      return new NextResponse(stream, { headers });
    }

    const privateUrl = await resolvePrivateStorageFileUrl(release.storageFileId);
    const upstreamUrl = privateUrl.startsWith("/") ? `${requestOrigin(request)}${privateUrl}` : privateUrl;
    const upstream = await fetch(upstreamUrl, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
    if (!upstream.ok || !upstream.body) {
      throw new Error("Private storage unavailable");
    }
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    console.error("Release download failed:", error instanceof Error ? error.message : "unknown error");
    return noStore(NextResponse.json({ error: "Could not load the release." }, { status: 502 }));
  }
}
