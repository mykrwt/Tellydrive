import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authorityErrorPayload, authorizeRequest } from "@/lib/backend-authority";
import { addFile, getFolderById, type StoredFile } from "@/lib/telegram-store";
import { verifyPartToken, type ChunkMeta, type PartTokenPayload } from "@/lib/telegram-storage";
import { sanitizeFileName, validateAnyFileType, validateFileType } from "@/lib/validation";
import { checkRateLimit, getRetryAfterSec } from "@/lib/rate-limit";
import { MAX_UPLOAD_PARTS, PART_UPLOAD_SIZE } from "@/lib/upload-config";

export const maxDuration = 60;

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Pragma", "no-cache");
  return res;
}

export async function POST(req: NextRequest) {
  let principal;
  try {
    principal = await authorizeRequest("storage:upload");
  } catch (error) {
    const failure = authorityErrorPayload(error);
    return noStore(NextResponse.json(failure.body, { status: failure.status }));
  }
  const user = principal.user;

  try {
    checkRateLimit(user.id, "upload");
  } catch (error: unknown) {
    const resetAt = (error as { resetAt?: number }).resetAt ?? Date.now() + 60_000;
    return noStore(
      NextResponse.json(
        { error: error instanceof Error ? error.message : "Too many requests" },
        { status: 429, headers: { "Retry-After": String(getRetryAfterSec(resetAt)) } },
      ),
    );
  }

  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      if (parsedOrigin.host !== host && parsedOrigin.host !== req.headers.get("x-forwarded-host")) {
        return noStore(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
      }
    } catch {
      return noStore(NextResponse.json({ error: "Invalid origin" }, { status: 400 }));
    }
  }

  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    return noStore(NextResponse.json({ error: "Invalid content type" }, { status: 400 }));
  }
  if (Number(req.headers.get("content-length") || 0) > 1024 * 1024) {
    return noStore(NextResponse.json({ error: "Payload too large" }, { status: 413 }));
  }

  let body: { uploadId?: unknown; parts?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return noStore(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }));
  }

  const uploadId = String(body.uploadId ?? "");
  const parts = body.parts;
  if (!uploadId || !/^[a-zA-Z0-9_-]+$/.test(uploadId) || uploadId.length > 64) {
    return noStore(NextResponse.json({ error: "Invalid uploadId" }, { status: 400 }));
  }
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > MAX_UPLOAD_PARTS) {
    return noStore(NextResponse.json({ error: "Invalid parts list" }, { status: 400 }));
  }

  type UploadAuthority = Pick<
    PartTokenPayload,
    "name" | "mimeType" | "totalSize" | "partCount" | "source" | "folderId"
  >;
  let uploadAuthority: UploadAuthority | null = null;
  const chunks = new Map<number, ChunkMeta>();
  let totalBytes = 0;

  for (const raw of parts) {
    if (typeof raw !== "string" || raw.length > 5000) {
      return noStore(NextResponse.json({ error: "Invalid upload grant" }, { status: 400 }));
    }
    const payload = verifyPartToken(raw);
    if (!payload) {
      return noStore(NextResponse.json({ error: "Invalid or expired upload grant. Please retry." }, { status: 400 }));
    }
    if (payload.sub !== user.id) {
      return noStore(NextResponse.json({ error: "Upload grant does not belong to this account." }, { status: 403 }));
    }
    if (payload.uploadId !== uploadId) {
      return noStore(NextResponse.json({ error: "Upload grants belong to a different upload." }, { status: 400 }));
    }

    const sealedAuthority: UploadAuthority = {
      name: payload.name,
      mimeType: payload.mimeType,
      totalSize: payload.totalSize,
      partCount: payload.partCount,
      source: payload.source,
      folderId: payload.folderId,
    };
    if (!uploadAuthority) {
      uploadAuthority = sealedAuthority;
    } else if (
      uploadAuthority.name !== sealedAuthority.name ||
      uploadAuthority.mimeType !== sealedAuthority.mimeType ||
      uploadAuthority.totalSize !== sealedAuthority.totalSize ||
      uploadAuthority.partCount !== sealedAuthority.partCount ||
      uploadAuthority.source !== sealedAuthority.source ||
      uploadAuthority.folderId !== sealedAuthority.folderId
    ) {
      return noStore(NextResponse.json({ error: "Upload grants have conflicting backend authority." }, { status: 400 }));
    }

    if (chunks.has(payload.order)) {
      return noStore(NextResponse.json({ error: "Duplicate upload part." }, { status: 400 }));
    }
    chunks.set(payload.order, {
      order: payload.order,
      messageId: payload.messageId,
      fileId: payload.fileId,
      size: payload.size,
    });
    totalBytes += payload.size;
  }

  if (!uploadAuthority) {
    return noStore(NextResponse.json({ error: "Missing backend upload authority." }, { status: 400 }));
  }
  if (
    uploadAuthority.totalSize <= 0 ||
    uploadAuthority.totalSize > principal.authority.entitlements.maxUploadBytes ||
    uploadAuthority.partCount !== parts.length
  ) {
    return noStore(NextResponse.json({ error: "Upload is outside the permitted limits." }, { status: 400 }));
  }
  for (let index = 0; index < uploadAuthority.partCount; index += 1) {
    if (!chunks.has(index)) {
      return noStore(NextResponse.json({ error: "Missing upload part. Please retry." }, { status: 400 }));
    }
  }
  if (totalBytes !== uploadAuthority.totalSize) {
    return noStore(NextResponse.json({ error: "Upload part sizes do not match." }, { status: 400 }));
  }
  if (uploadAuthority.source === "admin" && !principal.isAdmin) {
    return noStore(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }
  if (uploadAuthority.folderId && !(await getFolderById(user.id, uploadAuthority.folderId))) {
    return noStore(NextResponse.json({ error: "Target folder not found" }, { status: 404 }));
  }

  let safeName: string;
  try {
    safeName = sanitizeFileName(uploadAuthority.name);
  } catch {
    return noStore(NextResponse.json({ error: "Invalid file name" }, { status: 400 }));
  }
  const allowAny = uploadAuthority.source !== "gallery";
  const typeResult = allowAny
    ? validateAnyFileType(uploadAuthority.mimeType, safeName)
    : validateFileType(uploadAuthority.mimeType, safeName);
  if (!typeResult.ok) {
    return noStore(
      NextResponse.json(
        { error: allowAny ? "This file type is not supported." : "Only images and videos are supported." },
        { status: 400 },
      ),
    );
  }

  const orderedChunks = Array.from(chunks.values()).sort((a, b) => a.order - b.order);
  const chunked = orderedChunks.length > 1;
  const now = new Date().toISOString();
  const stored: StoredFile = {
    id: randomUUID(),
    userId: user.id,
    name: safeName,
    telegramFileId: orderedChunks[0].fileId,
    telegramMessageId: orderedChunks[0].messageId,
    size: uploadAuthority.totalSize,
    mimeType: uploadAuthority.mimeType,
    createdAt: now,
    updatedAt: now,
    chunked,
    chunkSize: chunked ? PART_UPLOAD_SIZE : undefined,
    chunkCount: chunked ? orderedChunks.length : undefined,
    chunks: chunked ? orderedChunks : undefined,
    folderId: uploadAuthority.folderId,
    source: uploadAuthority.source,
    favorite: false,
    trashed: false,
    version: 1,
  };

  try {
    await addFile(stored);
  } catch (error) {
    console.error("POST /api/files/finalize addFile error:", error);
    return noStore(NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 }));
  }
  return noStore(NextResponse.json({ id: stored.id, name: safeName, ok: true }, { status: 201 }));
}
