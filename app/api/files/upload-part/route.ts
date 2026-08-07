import { NextRequest, NextResponse } from "next/server";
import { authorityErrorPayload, authorizeRequest } from "@/lib/backend-authority";
import { getFolderById } from "@/lib/telegram-store";
import { sendPartToStorage, signPartToken, friendlyStorageError } from "@/lib/telegram-storage";
import { sanitizeFileName, validateAnyFileType, validateFileType } from "@/lib/validation";
import { checkRateLimit, getRetryAfterSec } from "@/lib/rate-limit";
import { PART_UPLOAD_SIZE, MAX_UPLOAD_PARTS } from "@/lib/upload-config";

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
    checkRateLimit(user.id, "uploadPart");
  } catch (e: unknown) {
    const resetAt = (e as unknown as { resetAt: number }).resetAt ?? Date.now() + 60000;
    return noStore(
      NextResponse.json({ error: e instanceof Error ? e.message : "Too many requests" }, { status: 429, headers: { "Retry-After": String(getRetryAfterSec(resetAt)) } })
    );
  }

  // CSRF check
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
  if (!ct.includes("multipart/form-data")) {
    return noStore(NextResponse.json({ error: "Invalid content type" }, { status: 400 }));
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid form data" }, { status: 400 }));
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return noStore(NextResponse.json({ error: "Missing part data" }, { status: 400 }));
  }

  const rawName = String(form.get("name") ?? "");
  const index = Number(form.get("index"));
  const count = Number(form.get("count"));
  const totalSize = Number(form.get("size"));
  const mimeType = String(form.get("mimeType") ?? file.type ?? "");
  const sourceRaw = String(form.get("source") ?? "gallery");
  const folderIdRaw = form.get("folderId");
  const folderId = folderIdRaw === null || folderIdRaw === "" || folderIdRaw === "root" ? null : String(folderIdRaw);
  if (folderId && !/^[a-zA-Z0-9_-]{6,64}$/.test(folderId)) {
    return noStore(NextResponse.json({ error: "Invalid folderId" }, { status: 400 }));
  }
  if (folderId && !(await getFolderById(user.id, folderId))) {
    return noStore(NextResponse.json({ error: "Target folder not found" }, { status: 404 }));
  }
  if (sourceRaw === "admin" && !principal.isAdmin) {
    return noStore(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }
  const source: "gallery" | "files" | "admin" =
    sourceRaw === "admin" && principal.isAdmin
      ? "admin"
      : sourceRaw === "files" || folderId
        ? "files"
        : "gallery";
  const allowAny = source !== "gallery";

  let safeName: string;
  try {
    safeName = sanitizeFileName(rawName);
  } catch {
    return noStore(NextResponse.json({ error: "Invalid file name" }, { status: 400 }));
  }

  if (
    !Number.isInteger(index) ||
    !Number.isInteger(count) ||
    !Number.isFinite(totalSize) ||
    count < 1 ||
    count > MAX_UPLOAD_PARTS ||
    index < 0 ||
    index >= count ||
    totalSize <= 0 ||
    totalSize > principal.authority.entitlements.maxUploadBytes
  ) {
    return noStore(NextResponse.json({ error: "Invalid part metadata" }, { status: 400 }));
  }

  if (file.size > PART_UPLOAD_SIZE + 64 * 1024) {
    return noStore(NextResponse.json({ error: "Part too large" }, { status: 400 }));
  }

  // Extra check: part index last piece may be smaller
  if (file.size === 0) return noStore(NextResponse.json({ error: "Empty part" }, { status: 400 }));

  const { ok: typeOk } = allowAny
    ? validateAnyFileType(mimeType || "application/octet-stream", safeName)
    : validateFileType(mimeType || "application/octet-stream", safeName);
  if (!typeOk) {
    return noStore(NextResponse.json({ error: allowAny ? "This file type is not supported." : "Only images and videos are supported." }, { status: 400 }));
  }

  const uploadId = String(form.get("uploadId") ?? "").slice(0, 64);
  if (!uploadId || !/^[a-zA-Z0-9_-]+$/.test(uploadId)) {
    return noStore(NextResponse.json({ error: "Invalid uploadId" }, { status: 400 }));
  }

  const chunkName = `${safeName}.part${String(index + 1).padStart(3, "0")}of${String(count).padStart(3, "0")}`;

  try {
    const { fileId, messageId } = await sendPartToStorage(
      chunkName,
      file,
      `Chunk ${index + 1}/${count} of ${safeName}`
    );

    const token = signPartToken({
      sub: user.id,
      uploadId,
      name: safeName,
      mimeType: mimeType || "application/octet-stream",
      totalSize,
      partCount: count,
      fileId,
      messageId,
      size: file.size,
      order: index,
      source,
      folderId,
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    });

    return noStore(NextResponse.json({ token, order: index }));
  } catch (err: unknown) {
    console.error("POST /api/files/upload-part error:", err);
    const msg = err instanceof Error ? err.message : "Upload failed";
    const userMsg = msg.includes("Telegram") || msg.includes("Storage") ? friendlyStorageError(msg) : "Upload failed";
    return noStore(NextResponse.json({ error: userMsg }, { status: 502 }));
  }
}
