import { NextRequest } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getUserWithPlan } from "@/lib/services/users";
import { createFile } from "@/lib/services/files";
import { storeFile } from "@/lib/storage";
import { maintenanceMode } from "@/lib/services/admin";

export const runtime = "nodejs";

// Upload endpoint. Accepts multipart/form-data with one or more `files`.
// Validation: authenticated user, allowed types (image/video for v1), per-file
// max upload size and total plan quota. Bytes are stored through the Storage
// Manager (Telegram / local) and only references live in the database.
export async function POST(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const wp = getUserWithPlan(userId);
  if (!wp) return Response.json({ error: "User not found" }, { status: 404 });
  if (wp.user.is_suspended) {
    return Response.json({ error: "Account suspended" }, { status: 403 });
  }
  if (maintenanceMode()) {
    return Response.json(
      { error: "Platform is in maintenance mode. Uploads are paused." },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const entries = form
    .getAll("files")
    .filter((v): v is File => v instanceof File);
  if (entries.length === 0) {
    return Response.json({ error: "No files provided" }, { status: 400 });
  }

  const folderIdRaw = form.get("folder_id");
  const folderId = folderIdRaw ? Number(folderIdRaw) : null;

  const quotaRemaining =
    wp.plan.storage_bytes - wp.user.storage_used_bytes;

  const results: any[] = [];
  let totalBytes = 0;

  for (const file of entries) {
    const name = file.name || "unnamed";
    const mime = file.type || "application/octet-stream";
    const isAllowed = mime.startsWith("image/") || mime.startsWith("video/");
    if (!isAllowed) {
      results.push({ name, status: "error", error: "Only images and videos are supported in v1" });
      continue;
    }
    const size = file.size;
    if (size > wp.plan.max_upload_bytes) {
      results.push({ name, status: "error", error: "File exceeds your plan's max upload size" });
      continue;
    }
    if (totalBytes + size > quotaRemaining) {
      results.push({ name, status: "error", error: "Storage quota exceeded" });
      continue;
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const stored = await storeFile(buffer, name, mime);
      totalBytes += size;
      const record = createFile(userId, {
        name,
        mime,
        sizeBytes: size,
        folderId,
        storageRef: stored.ref,
        previewRef: stored.previewRef ?? null,
        chunkInfo: stored.chunkInfo ?? null,
      });
      results.push({ name, status: "ok", id: record.id, size });
    } catch (e: any) {
      results.push({ name, status: "error", error: e?.message ?? "Upload failed" });
    }
  }

  return Response.json({ results, totalUploaded: totalBytes });
}
