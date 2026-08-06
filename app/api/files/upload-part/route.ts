import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sendPartToStorage, signPartToken, friendlyStorageError } from "@/lib/telegram-storage";
import { sanitizeFileName, validateFileType } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { PART_UPLOAD_SIZE, MAX_FILE_SIZE_BYTES, MAX_UPLOAD_PARTS } from "@/lib/upload-config";

// Vercel: give part forwarding headroom (small bodies, but slow links).
export const maxDuration = 60;

// POST /api/files/upload-part — multipart form-data with one small part.
// Fields: file (blob part), name (original file name), index (0-based),
// count (total parts), size (total original size), mimeType.
// Returns a signed token the client passes to /api/files/finalize.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    checkRateLimit(user.id, "uploadPart");
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Too many requests" },
      { status: 429 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing part data" }, { status: 400 });
  }

  const rawName = String(form.get("name") ?? "");
  const index = Number(form.get("index"));
  const count = Number(form.get("count"));
  const totalSize = Number(form.get("size"));
  const mimeType = String(form.get("mimeType") ?? file.type ?? "");

  let safeName: string;
  try {
    safeName = sanitizeFileName(rawName);
  } catch {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
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
    totalSize > MAX_FILE_SIZE_BYTES
  ) {
    return NextResponse.json({ error: "Invalid part metadata" }, { status: 400 });
  }

  // Parts must stay under the platform body limit; the client splits at
  // PART_UPLOAD_SIZE, so anything bigger here is malformed.
  if (file.size > PART_UPLOAD_SIZE + 64 * 1024) {
    return NextResponse.json({ error: "Part too large" }, { status: 400 });
  }

  const { ok: typeOk } = validateFileType(mimeType || "application/octet-stream", safeName);
  if (!typeOk) {
    return NextResponse.json({ error: "Only images and videos are supported." }, { status: 400 });
  }

  const uploadId = String(form.get("uploadId") ?? "").slice(0, 64);
  if (!uploadId || !/^[a-zA-Z0-9_-]+$/.test(uploadId)) {
    return NextResponse.json({ error: "Invalid uploadId" }, { status: 400 });
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
      fileId,
      messageId,
      size: file.size,
      order: index,
      // Parts must be finalized within 24h (covers very large uploads on slow links)
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    });

    return NextResponse.json({ token, order: index });
  } catch (err: unknown) {
    console.error("POST /api/files/upload-part error:", err);
    const msg = err instanceof Error ? err.message : "Upload failed";
    const userMsg = msg.includes("Telegram") || msg.includes("Storage") ? friendlyStorageError(msg) : msg;
    return NextResponse.json({ error: userMsg }, { status: 502 });
  }
}
