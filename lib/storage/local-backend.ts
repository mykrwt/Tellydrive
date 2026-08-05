import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  createWriteStream,
  createReadStream,
  statSync,
  rmSync,
  existsSync,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { config } from "@/lib/config";
import type {
  StorageBackend,
  StoredObject,
  ReadResult,
} from "@/lib/storage/types";

// Local-disk backend. Used as a zero-config fallback so the app works with no
// external tokens (dev previews / local testing). Fully swappable — the app
// only ever talks to the Storage Manager.

export class LocalBackend implements StorageBackend {
  readonly kind = "local" as const;
  readonly isConfigured = true;
  readonly label = "Local disk (dev fallback)";

  private resolve(ref: string): string {
    // Keep refs inside the storage root — never trust raw paths.
    const root = path.join(config.dataDir, "storage");
    const full = path.resolve(root, ref);
    if (!full.startsWith(path.resolve(root))) {
      throw new Error("Invalid storage reference");
    }
    return full;
  }

  async store(data: Buffer, filename: string): Promise<StoredObject> {
    const id = randomUUID();
    const safe = filename.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    const ref = `${id}/${safe}`;
    const dir = path.join(config.dataDir, "storage", id);
    mkdirSync(dir, { recursive: true });
    await pipeline(Readable.from([data]), createWriteStream(this.resolve(ref)));
    return { ref };
  }

  async read(ref: string, contentType = "application/octet-stream"): Promise<ReadResult> {
    const full = this.resolve(ref);
    if (!existsSync(full)) throw new Error("File not found");
    const { size } = statSync(full);
    const stream = Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
    return { stream, contentType, length: size };
  }

  async remove(ref: string): Promise<void> {
    const full = this.resolve(ref);
    if (existsSync(full)) rmSync(full, { force: true });
    // Clean up empty parent folder.
    const dir = path.dirname(full);
    try {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export function isLocalRef(ref: string): boolean {
  return Boolean(ref) && !ref.includes(":");
}
