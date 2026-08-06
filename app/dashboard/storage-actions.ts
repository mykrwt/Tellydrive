"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { addFile, removeFile, uploadToTelegram, getTelegramFileUrl, updateUserSettings, type StoredFile } from "@/lib/telegram-store";
import { randomUUID } from "node:crypto";

export async function updateTelegramSettingsAction(token: string, chatId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  await updateUserSettings(user.id, { telegramToken: token, telegramChatId: chatId });
  revalidatePath("/dashboard");
}

export async function uploadFileAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Fetch full user to get telegram settings
  const { findUserById } = await import("@/lib/telegram-store");
  const fullUser = await findUserById(user.id);
  if (!fullUser) throw new Error("User not found");

  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const userConfig = (fullUser.telegramToken && fullUser.telegramChatId) 
    ? { token: fullUser.telegramToken, chatId: fullUser.telegramChatId }
    : undefined;

  const { fileId } = await uploadToTelegram(file.name, file, userConfig);

  const storedFile: StoredFile = {
    id: randomUUID(),
    userId: user.id,
    name: file.name,
    telegramFileId: fileId,
    size: file.size,
    mimeType: file.type,
    createdAt: new Date().toISOString(),
  };

  await addFile(storedFile);
  revalidatePath("/dashboard");
}

export async function deleteFileAction(fileId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  await removeFile(fileId, user.id);
  revalidatePath("/dashboard");
}

export async function getDownloadUrlAction(telegramFileId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const { findUserById } = await import("@/lib/telegram-store");
  const fullUser = await findUserById(user.id);
  
  const userConfig = fullUser?.telegramToken ? { token: fullUser.telegramToken } : undefined;

  return await getTelegramFileUrl(telegramFileId, userConfig);
}
