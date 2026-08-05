import { config } from "@/lib/config";
import type { StorageBackend, StoredObject, ReadResult } from "@/lib/storage/types";
import { TelegramBackend } from "@/lib/storage/telegram-backend";
import { LocalBackend } from "@/lib/storage/local-backend";

// Storage Manager — the single facade for all storage operations. Business
// logic calls these methods and never cares which backend is active. See PRD
// §12 and Appendix B.
//
// Storage is per-user ("bring your own Telegram"): each user can connect their
// own bot token + chat id and their files live in their own Telegram chat. When
// a user has no own configuration, the platform default backend is used (the
// owner's TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID from env, else local disk).

/** Minimal storage owner — structurally satisfied by a UserRow. */
export interface StorageOwner {
  tg_bot_token?: string | null;
  tg_chat_id?: string | null;
}

const _userBackends = new Map<string, StorageBackend>();
let _defaultBackend: StorageBackend | null = null;

function selectDefaultBackend(): StorageBackend {
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

/**
 * Resolve the storage backend for an owner (a UserRow or a light object with
 * the tg_* fields). Uses the owner's own Telegram credentials when present,
 * otherwise falls back to the platform default backend.
 */
export function getStorageManager(owner?: StorageOwner | null): StorageBackend {
  const botToken = owner?.tg_bot_token?.trim() || "";
  const chatId = owner?.tg_chat_id?.trim() || "";
  if (botToken && chatId) {
    const key = `tg:${botToken}:${chatId}`;
    let backend = _userBackends.get(key);
    if (!backend) {
      backend = new TelegramBackend({ botToken, chatId });
      _userBackends.set(key, backend);
    }
    return backend;
  }
  if (!_defaultBackend) _defaultBackend = selectDefaultBackend();
  return _defaultBackend;
}

export function storageLabel(owner?: StorageOwner | null): string {
  return getStorageManager(owner).label;
}

export async function storeFile(
  data: Buffer,
  filename: string,
  mime: string,
  owner?: StorageOwner | null,
): Promise<StoredObject> {
  return getStorageManager(owner).store(data, filename, mime);
}

export async function readFile(
  ref: string,
  contentType?: string,
  owner?: StorageOwner | null,
): Promise<ReadResult> {
  return getStorageManager(owner).read(ref, contentType);
}

export async function removeFile(
  ref: string,
  owner?: StorageOwner | null,
): Promise<void> {
  await getStorageManager(owner).remove(ref);
}
