import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { addFile, type StoredFile } from "@/lib/telegram-store";
import { verifyPartToken, type ChunkMeta } from "@/lib/telegram-storage";
import { sanitizeFileName, validateFileType } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { MAX_FILE_SIZE_BYTES, MAX_UPLOAD_PARTS, PART_UPLOAD_SIZE } from "@/lib/upload-config";

export const maxDuration = 60;

// POST /api/files/finalize — JSON { name, size, mimeType, uploadId, parts: [token…] }
// Verifies the signed part tokens, then records the complete file.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    checkRateLimit(user.id, "upload");
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Too many requests" },
      { status: 429 }
    );
  }

  let body: {
    name?: unknown;
    size?: unknown;
    mimeType?: unknown;
    uploadId?: unknown;
    parts?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let safeName: string;
  try {
    safeName = sanitizeFileName(String(body.name ?? ""));
  } catch {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  }

  const size = Number(body.size);
  const mimeType = String(body.mimeType ?? "") || "application/octet-stream";
  const uploadId = String(body.uploadId ?? "");
  const parts = body.parts;

  if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "Invalid file size" }, { status: 400 });
  }
  if (!uploadId || !/^[a-zA-Z0-9_-]+$/.test(uploadId) || uploadId.length > 64) {
    return NextResponse.json({ error: "Invalid uploadId" }, { status: 400 });
  }
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > MAX_UPLOAD_PARTS) {
    return NextResponse.json({ error: "Invalid parts list" }, { status: 400 });
  }

  const { ok: typeOk } = validateFileType(mimeType, safeName);
  if (!typeOk) {
    return NextResponse.json({ error: "Only images and videos are supported." }, { status: 400 });
  }

  // Verify every part token: signature, expiry, owner, matching uploadId.
  const chunks = new Map<number, ChunkMeta>();
  let totalBytes = 0;
  for (const raw of parts) {
    const payload = verifyPartToken(raw);
    if (!payload) return NextResponse.json({ error: "Invalid or expired upload part. Please retry the upload." }, { status: 400 });
    if (payload.sub !== user.id) return NextResponse.json({ error: "Part does not belong to this account." }, { status: 403 });
    if (payload.uploadId !== uploadId) return NextResponse.json({ error: "Parts belong to a different upload." }, { status: 400 });
    if (chunks.has(payload.order)) return NextResponse.json({ error: "Duplicate part received." }, { status: 400 });
    chunks.set(payload.order, {
      order: payload.order,
      messageId: payload.messageId,
      fileId: payload.fileId,
      size: payload.size,
    });
    totalBytes += payload.size;
  }

  // Parts must be contiguous from 0..count-1 and reassemble to the declared size.
  const count = parts.length;
  for (let i = 0; i < count; i++) {
    if (!chunks.has(i)) return NextResponse.json({ error: "Missing part. Please retry the upload." }, { status: 400 });
  }
  if (totalBytes !== size) {
    return NextResponse.json({ error: "Part sizes do not match the declared file size." }, { status: 400 });
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
    folderId: null,
    favorite: false,
    trashed: false,
    version: 1,
  };

  try {
    await addFile(stored);
  } catch (err: unknown) {
    console.error("POST /api/files/finalize addFile error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ id: stored.id, name: safeName, ok: true }, { status: 201 });
}
