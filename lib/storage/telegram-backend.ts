import { config } from "@/lib/config";
import type {
  StorageBackend,
  StoredObject,
  ReadResult,
} from "@/lib/storage/types";

// Telegram Bot API storage backend (PRD Appendix B). Files are uploaded to a
// private chat/channel via the Bot API and referenced by their `file_id`.
// Large files are split into chunks and reconstructed transparently.
// The app never touches Telegram directly — everything goes through the
// Storage Manager.

const API = config.telegram.apiBase || "https://api.telegram.org";
// Keep chunks comfortably under the Bot API's ~50 MB upload limit.
const CHUNK_SIZE = 15 * 1024 * 1024;

interface TgResult {
  ok: boolean;
  description?: string;
  result?: any;
}

export class TelegramBackend implements StorageBackend {
  readonly kind = "telegram" as const;
  readonly isConfigured = Boolean(
    config.telegram.botToken && config.telegram.chatId,
  );
  readonly label = "Telegram storage backend";

  private get chatId(): string {
    if (!config.telegram.chatId) {
      throw new Error(
        "TELEGRAM_CHAT_ID is not set. See SETUP.md to configure the storage chat.",
      );
    }
    return config.telegram.chatId;
  }

  private token() {
    if (!config.telegram.botToken) {
      throw new Error("TELEGRAM_BOT_TOKEN is not set.");
    }
    return config.telegram.botToken;
  }

  private async call(method: string, params: Record<string, any>): Promise<TgResult> {
    const res = await fetch(`${API}/bot${this.token()}/${method}`, {
      method: "POST",
      body: new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ),
    });
    const json = (await res.json()) as TgResult;
    if (!json.ok) {
      throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
    }
    return json;
  }

  private async sendDocument(data: Buffer, filename: string, mime: string) {
    const form = new FormData();
    form.append("chat_id", this.chatId);
    form.append("document", new Blob([new Uint8Array(data)], { type: mime }), filename);
    const res = await fetch(`${API}/bot${this.token()}/sendDocument`, {
      method: "POST",
      body: form,
    });
    const json = (await res.json()) as TgResult;
    if (!json.ok) {
      throw new Error(`Telegram sendDocument failed: ${json.description ?? res.status}`);
    }
    const doc = json.result?.document;
    return {
      fileId: doc?.file_id as string,
      thumbId: (doc?.thumbnail?.file_id as string) ?? null,
    };
  }

  private async getFilePath(fileId: string): Promise<string> {
    const json = await this.call("getFile", { file_id: fileId });
    const fp = json.result?.file_path as string;
    if (!fp) throw new Error("Telegram could not resolve file path");
    return fp;
  }

  private async download(fileId: string): Promise<ReadableStream<Uint8Array>> {
    const filePath = await this.getFilePath(fileId);
    const url = `${API}/file/bot${this.token()}/${filePath}`;
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error("Telegram download failed");
    return res.body;
  }

  async store(
    data: Buffer,
    filename: string,
    mime: string,
  ): Promise<StoredObject> {
    if (data.length <= CHUNK_SIZE) {
      const { fileId, thumbId } = await this.sendDocument(data, filename, mime);
      return { ref: fileId, previewRef: thumbId || null, chunkInfo: null };
    }
    // Chunked upload.
    const chunks: string[] = [];
    let previewRef: string | null = null;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const part = data.subarray(i, i + CHUNK_SIZE);
      const chunkName = `${filename}.part${Math.floor(i / CHUNK_SIZE)}`;
      const { fileId, thumbId } = await this.sendDocument(part, chunkName, mime);
      chunks.push(fileId);
      if (i === 0) previewRef = thumbId || null;
    }
    return {
      ref: JSON.stringify({ chunks }),
      previewRef,
      chunkInfo: JSON.stringify({ chunkCount: chunks.length }),
    };
  }

  async read(ref: string, contentType = "application/octet-stream"): Promise<ReadResult> {
    // Reassemble chunks if present.
    const chunks = this.parseChunks(ref);
    const streams: ReadableStream<Uint8Array>[] = [];
    const length = 0;
    if (chunks.length === 0) {
      streams.push(await this.download(ref));
    } else {
      for (const c of chunks) {
        streams.push(await this.download(c));
      }
    }
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const s of streams) {
          const reader = s.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        }
        controller.close();
      },
    });
    return { stream, contentType, length };
  }

  async remove(ref: string): Promise<void> {
    // Telegram file ids can't be deleted via the public Bot API; the metadata
    // record is what we remove. No-op on the backend, kept for interface parity.
    void ref;
  }

  private parseChunks(ref: string): string[] {
    if (ref.startsWith("{") && ref.endsWith("}")) {
      try {
        const parsed = JSON.parse(ref) as { chunks: string[] };
        return Array.isArray(parsed.chunks) ? parsed.chunks : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}
