import { config } from "@/lib/config";
import type { StorageBackend, StoredObject, ReadResult } from "@/lib/storage/types";
import { TelegramBackend } from "@/lib/storage/telegram-backend";
import { LocalBackend } from "@/lib/storage/local-backend";

// Storage Manager — the single facade for all storage operations. Business
// logic calls these methods and never cares which backend is active. See PRD
// §12 and Appendix B.

let _backend: StorageBackend | null = null;

function selectBackend(): StorageBackend {
  const tg = new TelegramBackend();
  if (config.storageBackend === "telegram" || config.storageBackend === "auto") {
    if (tg.isConfigured) return tg;
  }
  if (config.storageBackend === "telegram") {
    throw new Error(
      "STORAGE_BACKEND=telegram but TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set.",
    );
  }
  return new LocalBackend();
}

export function getStorageManager(): StorageBackend {
  if (!_backend) _backend = selectBackend();
  return _backend;
}

export function storageLabel(): string {
  return getStorageManager().label;
}

export async function storeFile(
  data: Buffer,
  filename: string,
  mime: string,
): Promise<StoredObject> {
  return getStorageManager().store(data, filename, mime);
}

export async function readFile(
  ref: string,
  contentType?: string,
): Promise<ReadResult> {
  return getStorageManager().read(ref, contentType);
}

export async function removeFile(ref: string): Promise<void> {
  await getStorageManager().remove(ref);
}
