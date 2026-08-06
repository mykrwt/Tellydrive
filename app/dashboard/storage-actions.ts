"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  addFile,
  removeFile,
  updateFile,
  type StoredFile,
} from "@/lib/telegram-store";
import { uploadToStorage, getStorageFileUrl } from "@/lib/telegram-storage";
import { sanitizeFileName } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { randomUUID } from "node:crypto";

function genericError() {
  return "Something went wrong. Please try again.";
}

// Keep legacy Telegram settings but hidden behind feature flag
export async function updateTelegramSettingsAction(token: string, chatId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  // Extra gate: only allow if feature flag enabled
  if (process.env.NEXT_PUBLIC_ENABLE_TELEGRAM_SETUP !== "true") {
    throw new Error("Telegram setup is disabled.");
  }
  const { updateUserSettings } = await import("@/lib/telegram-store");
  await updateUserSettings(user.id, { telegramToken: token, telegramChatId: chatId });
  revalidatePath("/dashboard");
}

export async function uploadFileAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  try {
    checkRateLimit(user.id, "upload");
  } catch (e: unknown) {
    throw new Error(e instanceof Error ? e.message : genericError());
  }

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided");

  // Validation
  let safeName: string;
  try {
    safeName = sanitizeFileName(file.name);
  } catch {
    throw new Error("Invalid file name.");
  }
  if (!file.type) throw new Error("Missing file type.");

  // Upload via storage layer without transcoding. Telegram document storage preserves
  // the original file bytes, resolution, and image/video quality; chunking only splits large files.
  let result;
  try {
    result = await uploadToStorage(safeName, file, {});
  } catch (err: unknown) {
    // Map internal errors to generic user-facing messages, log details server-side
    console.error("uploadToStorage failed:", err);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg && !msg.includes("Telegram") ? msg : genericError());
  }

  // Build StoredFile index entry
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const storedFile: StoredFile = {
    id: randomUUID(),
    userId: user.id,
    name: safeName,
    telegramFileId: result.fileId,
    telegramMessageId: result.messageId,
    size: file.size,
    mimeType: file.type,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    chunked: result.chunked,
    chunkSize: result.chunkSize,
    chunkCount: result.chunkCount,
    chunks: result.chunks,
    folderId: null,
    favorite: false,
    trashed: false,
    version: 1,
    // For gallery: width/height could be extracted later via image processing
    // placeholder
    width: isImage ? undefined : undefined,
    height: isImage ? undefined : undefined,
    duration: isVideo ? undefined : undefined,
  };

  await addFile(storedFile);
  revalidatePath("/dashboard");
  return { id: storedFile.id };
}

export async function uploadMultipleAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const files = formData.getAll("files") as File[];
  if (!files.length) throw new Error("No files provided");

  // Sequential batch to respect Telegram limits; do not flood
  const results: Array<{ name: string; ok: boolean; error?: string; id?: string }> = [];
  for (const file of files) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { id } = await uploadFileAction(fd);
      results.push({ name: file.name, ok: true, id });
    } catch (e: unknown) {
      results.push({ name: file.name, ok: false, error: e instanceof Error ? e.message : genericError() });
    }
  }
  return results;
}

export async function deleteFileAction(fileId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  try {
    checkRateLimit(user.id, "delete");
  } catch (e: unknown) {
    throw new Error(e instanceof Error ? e.message : genericError());
  }
  if (!fileId || typeof fileId !== "string") throw new Error("Invalid file id");
  // Server verifies ownership inside removeFile
  await removeFile(fileId, user.id);
  revalidatePath("/dashboard");
}

export async function deleteMultipleAction(fileIds: string[]) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!Array.isArray(fileIds) || fileIds.length > 100) throw new Error("Too many files");
  for (const id of fileIds) {
    await removeFile(id, user.id);
  }
  revalidatePath("/dashboard");
}

export async function toggleFavoriteAction(fileId: string, favorite: boolean) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  await updateFile(user.id, fileId, { favorite });
  revalidatePath("/dashboard");
}

export async function getDownloadUrlAction(telegramFileId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  try {
    checkRateLimit(user.id, "download");
  } catch (e: unknown) {
    throw new Error(e instanceof Error ? e.message : genericError());
  }
  // Verify ownership before exposing URL
  const { getFilesForUser } = await import("@/lib/telegram-store");
  const files = await getFilesForUser(user.id);
  const owned = files.find(
    (f) => f.telegramFileId === telegramFileId || f.chunks?.some((c) => c.fileId === telegramFileId)
  );
  if (!owned) throw new Error("File not found");
  // For chunked files, the primary fileId is first chunk; downstream handling needs all chunks
  // For now return primary URL; client can request chunks via separate endpoint if needed
  return await getStorageFileUrl(telegramFileId);
}

export async function getFileUrlsAction(fileId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const { getFilesForUser } = await import("@/lib/telegram-store");
  const files = await getFilesForUser(user.id);
  const file = files.find((f) => f.id === fileId);
  if (!file) throw new Error("File not found");
  if (file.chunked && file.chunks?.length) {
    const { getChunkUrls } = await import("@/lib/telegram-storage");
    return await getChunkUrls(file.chunks);
  }
  return [await getStorageFileUrl(file.telegramFileId)];
}
