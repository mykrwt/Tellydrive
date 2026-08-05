// The Storage Manager is the ONLY component allowed to talk to a storage
// backend. Business logic must never know whether data lives on Telegram,
// disk, S3, etc. See PRD §12 and Appendix B.

export interface StoredObject {
  // Opaque reference returned by the backend (telegram file id / local path).
  ref: string;
  // Optional thumbnail / preview reference.
  previewRef?: string | null;
  // Set when the object was stored in chunks (telegram large files).
  chunkInfo?: string | null;
}

export interface ReadResult {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  length: number;
}

export interface StorageBackend {
  kind: "telegram" | "local";
  isConfigured: boolean;
  label: string;
  /** Store a file and return the reference(s) to persist in the database. */
  store(data: Buffer, filename: string, mime: string): Promise<StoredObject>;
  /** Open a readable stream for a stored reference. */
  read(ref: string, contentType?: string): Promise<ReadResult>;
  /** Permanently delete a stored reference. */
  remove(ref: string): Promise<void>;
}
