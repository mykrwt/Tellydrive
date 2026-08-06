import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { addFile, getFolderById, type StoredFile } from "@/lib/telegram-store";
import { verifyPartToken, type ChunkMeta } from "@/lib/telegram-storage";
import { sanitizeFileName, validateAnyFileType, validateFileType } from "@/lib/validation";
import { checkRateLimit, getRetryAfterSec } from "@/lib/rate-limit";
import { MAX_FILE_SIZE_BYTES, MAX_UPLOAD_PARTS, PART_UPLOAD_SIZE } from "@/lib/upload-config";

export const maxDuration = 60;

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Pragma", "no-cache");
  return res;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return noStore(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

  try {
    checkRateLimit(user.id, "upload");
  } catch (e: unknown) {
    const resetAt = (e as unknown as { resetAt: number }).resetAt ?? Date.now() + 60000;
    return noStore(
      NextResponse.json({ error: e instanceof Error ? e.message : "Too many requests" }, { status: 429, headers: { "Retry-After": String(getRetryAfterSec(resetAt)) } })
    );
  }

  // CSRF
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

  // Enforce JSON content-type and size limit (parts array could be large but bounded)
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return noStore(NextResponse.json({ error: "Invalid content type" }, { status: 400 }));
  // Quick body size guard via content-length if present
  const cl = Number(req.headers.get("content-length") || 0);
  if (cl > 1024 * 1024) return noStore(NextResponse.json({ error: "Payload too large" }, { status: 413 }));

  let body: {
    name?: unknown;
    size?: unknown;
    mimeType?: unknown;
    uploadId?: unknown;
    parts?: unknown;
    folderId?: unknown;
    allowAny?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return noStore(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }));
  }

  let safeName: string;
  try {
    safeName = sanitizeFileName(String(body.name ?? ""));
  } catch {
    return noStore(NextResponse.json({ error: "Invalid file name" }, { status: 400 }));
  }

  const size = Number(body.size);
  const mimeType = String(body.mimeType ?? "") || "application/octet-stream";
  const uploadId = String(body.uploadId ?? "");
  const parts = body.parts;

  if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE_BYTES) {
    return noStore(NextResponse.json({ error: "Invalid file size" }, { status: 400 }));
  }
  if (!uploadId || !/^[a-zA-Z0-9_-]+$/.test(uploadId) || uploadId.length > 64) {
    return noStore(NextResponse.json({ error: "Invalid uploadId" }, { status: 400 }));
  }
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > MAX_UPLOAD_PARTS) {
    return noStore(NextResponse.json({ error: "Invalid parts list" }, { status: 400 }));
  }

  // Optional target folder (Files section) + relaxed type allow-list
  const folderIdRaw = body.folderId;
  const folderId: string | null =
    folderIdRaw === null || folderIdRaw === undefined || folderIdRaw === "" || folderIdRaw === "root" ? null : String(folderIdRaw);
  if (folderId && !/^[a-zA-Z0-9_-]{6,64}$/.test(folderId)) {
    return noStore(NextResponse.json({ error: "Invalid folderId" }, { status: 400 }));
  }
  if (folderId) {
    const folder = await getFolderById(user.id, folderId);
    if (!folder) return noStore(NextResponse.json({ error: "Target folder not found" }, { status: 404 }));
  }
  const allowAny = body.allowAny === true;

  // Validate mime before token verification to avoid wasted work on banned types
  const { ok: typeOk } = allowAny ? validateAnyFileType(mimeType, safeName) : validateFileType(mimeType, safeName);
  if (!typeOk) {
    return noStore(NextResponse.json({ error: allowAny ? "This file type is not supported." : "Only images and videos are supported." }, { status: 400 }));
  }

  const chunks = new Map<number, ChunkMeta>();
  let totalBytes = 0;
  for (const raw of parts) {
    if (typeof raw !== "string" || raw.length > 5000) return noStore(NextResponse.json({ error: "Invalid part token" }, { status: 400 }));
    const payload = verifyPartToken(raw);
    if (!payload) return noStore(NextResponse.json({ error: "Invalid or expired upload part. Please retry the upload." }, { status: 400 }));
    if (payload.sub !== user.id) return noStore(NextResponse.json({ error: "Part does not belong to this account." }, { status: 403 }));
    if (payload.uploadId !== uploadId) return noStore(NextResponse.json({ error: "Parts belong to a different upload." }, { status: 400 }));
    if (chunks.has(payload.order)) return noStore(NextResponse.json({ error: "Duplicate part received." }, { status: 400 }));
    chunks.set(payload.order, {
      order: payload.order,
      messageId: payload.messageId,
      fileId: payload.fileId,
      size: payload.size,
    });
    totalBytes += payload.size;
  }

  const count = parts.length;
  for (let i = 0; i < count; i++) {
    if (!chunks.has(i)) return noStore(NextResponse.json({ error: "Missing part. Please retry the upload." }, { status: 400 }));
  }
  if (totalBytes !== size) {
    return noStore(NextResponse.json({ error: "Part sizes do not match the declared file size." }, { status: 400 }));
  }

  const orderedChunks = Array.from(chunks.values()).sort((a, b) => a.order - b.order);
  const chunked = count > 1;

  const stored: StoredFile = {
    id: randomUUID(),
    userId: user.id,
    name: safeName,
    telegramFileId: orderedChunks[0].fileId,
    telegramMessageId: orderedChunks[0].messageId,
    size,
    mimeType,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    chunked,
    chunkSize: chunked ? PART_UPLOAD_SIZE : undefined,
    chunkCount: chunked ? count : undefined,
    chunks: chunked ? orderedChunks : undefined,
    folderId,
    favorite: false,
    trashed: false,
    version: 1,
  };

  try {
    await addFile(stored);
  } catch (err: unknown) {
    console.error("POST /api/files/finalize addFile error:", err);
    return noStore(NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 }));
  }

  return noStore(NextResponse.json({ id: stored.id, name: safeName, ok: true }, { status: 201 }));
}
