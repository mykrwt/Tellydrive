import "server-only";

import { databaseMode, getFilesForUser, getFoldersForUser, type StoredFile } from "@/lib/telegram-store";
import { formatBytes, formatDate } from "@/lib/format";

export type DashboardSummary = {
  storageUsedBytes: number;
  storageUsedLabel: string;
  storagePercent: number;
  storageRemainingLabel: string;
  fileCount: number;
  folderCount: number;
  photoCount: number;
  videoCount: number;
  recentUpload: {
    name: string;
    createdAt: string;
    createdLabel: string;
  } | null;
  storageMode: "private" | "unavailable";
  storageModeLabel: string;
};

function publicStorageState(mode: ReturnType<typeof databaseMode>): Pick<DashboardSummary, "storageMode" | "storageModeLabel"> {
  if (mode === "unconfigured") {
    return { storageMode: "unavailable", storageModeLabel: "Private storage unavailable" };
  }
  return { storageMode: "private", storageModeLabel: "Private cloud storage" };
}

function calculateStoragePercent(bytes: number) {
  if (bytes <= 0) return 4;
  const softCap = Math.max(5 * 1024 * 1024 * 1024, bytes * 1.2);
  const percent = Math.round((bytes / softCap) * 100);
  return Math.max(6, Math.min(percent, 92));
}

function latestByDate(files: StoredFile[]) {
  return files
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
}

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const [files, folders] = await Promise.all([getFilesForUser(userId), getFoldersForUser(userId)]);

  const storageUsedBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
  const recent = latestByDate(files);
  const mode = databaseMode();
  const publicState = publicStorageState(mode);

  return {
    storageUsedBytes,
    storageUsedLabel: formatBytes(storageUsedBytes),
    storagePercent: calculateStoragePercent(storageUsedBytes),
    storageRemainingLabel: mode === "unconfigured" ? "Setup required" : "No hard cap set",
    fileCount: files.length,
    folderCount: folders.length,
    photoCount: files.filter((file) => file.mimeType.startsWith("image/")).length,
    videoCount: files.filter((file) => file.mimeType.startsWith("video/")).length,
    recentUpload: recent
      ? {
          name: recent.name,
          createdAt: recent.createdAt,
          createdLabel: formatDate(recent.createdAt),
        }
      : null,
    storageMode: publicState.storageMode,
    storageModeLabel: publicState.storageModeLabel,
  };
}
