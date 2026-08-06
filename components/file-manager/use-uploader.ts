"use client";

import { useCallback, useState } from "react";
import { PART_UPLOAD_SIZE } from "@/lib/upload-config";

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  file: File;
};

type UploadTarget = string | null; // folder id, or null for root

type UploadApiData = {
  error?: string;
  results?: Array<{ ok?: boolean; error?: string }>;
} | null;

async function api(path: string, init?: RequestInit): Promise<{ ok: boolean; data: UploadApiData }> {
  const res = await fetch(path, init);
  let data: UploadApiData = null;
  try {
    data = (await res.json()) as UploadApiData;
  } catch {
    data = null;
  }
  return { ok: res.ok, data };
}

/**
 * Chunked uploader with retry/backoff, per-file progress, and an upload queue.
 * Uploads land in `folderId` (null = root) and accept any safe file type
 * (documents, audio, archives — see validateAnyFileType).
 */
export function useUploader(onComplete: () => Promise<void>) {
  const [queue, setQueue] = useState<UploadItem[]>([]);

  const uploadInParts = useCallback(async (item: UploadItem, folderId: UploadTarget) => {
    const file = item.file;
    const count = Math.ceil(file.size / PART_UPLOAD_SIZE);
    const uploadId = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const tokens: string[] = [];
    let lastEmit = 0;

    for (let i = 0; i < count; i++) {
      const start = i * PART_UPLOAD_SIZE;
      const part = file.slice(start, Math.min(start + PART_UPLOAD_SIZE, file.size));
      const fd = new FormData();
      fd.append("file", part, `${file.name}.part${String(i + 1).padStart(3, "0")}`);
      fd.append("name", file.name);
      fd.append("index", String(i));
      fd.append("count", String(count));
      fd.append("size", String(file.size));
      fd.append("mimeType", file.type || "application/octet-stream");
      fd.append("uploadId", uploadId);
      fd.append("allowAny", "1");

      let attempt = 0;
      let res: Response | null = null;
      let data: { token?: string; error?: string } = {};
      while (attempt < 4) {
        res = await fetch("/api/files/upload-part", { method: "POST", body: fd });
        data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
        if (res.ok && data.token) break;
        if (res.status === 429 || res.status >= 500) {
          const ra = Number(res.headers.get("Retry-After") || "1");
          await new Promise((r) => setTimeout(r, Math.min(4000, (isFinite(ra) ? ra * 1000 : 600 * Math.pow(2, attempt)) + Math.random() * 200)));
          attempt++;
          continue;
        }
        break;
      }
      if (!res?.ok || !data.token) throw new Error(data.error || `Upload failed (part ${i + 1} of ${count})`);
      tokens.push(data.token);
      const pct = Math.round(((i + 1) / count) * 95);
      const now = Date.now();
      if (now - lastEmit > 120 || i === count - 1) {
        lastEmit = now;
        setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, progress: pct } : x)));
      }
    }

    const fin = await api("/api/files/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        uploadId,
        parts: tokens,
        folderId,
        allowAny: true,
      }),
    });
    if (!fin.ok) throw new Error(fin.data?.error || "Upload failed");
  }, []);

  const uploadFiles = useCallback(
    async (list: FileList | File[], folderId: UploadTarget) => {
      const arr = Array.from(list);
      if (!arr.length) return;
      const items: UploadItem[] = arr.map((f) => ({
        id: Math.random().toString(36).slice(2),
        name: f.name,
        size: f.size,
        progress: 0,
        status: "queued" as const,
        file: f,
      }));
      setQueue((q) => [...q, ...items]);

      for (const item of items) {
        setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "uploading" as const } : x)));
        try {
          if (item.file.size > PART_UPLOAD_SIZE) {
            await uploadInParts(item, folderId);
          } else {
            const fd = new FormData();
            fd.append("file", item.file, item.file.name);
            fd.append("folderId", folderId ?? "root");
            fd.append("allowAny", "1");
            const res = await api("/api/files", { method: "POST", body: fd });
            if (!res.ok) throw new Error(res.data?.error || "Upload failed");
            const result = res.data?.results?.[0];
            if (result && !result.ok) throw new Error(result.error || "Upload failed");
          }
          setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, progress: 100, status: "done" as const } : x)));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "error" as const, error: msg } : x)));
        }
      }

      // Refresh once the batch finishes
      try {
        await onComplete();
      } catch {
        // refresh failures are surfaced elsewhere
      }
      setTimeout(() => {
        setQueue((q) => q.filter((x) => x.status === "uploading" || x.status === "queued"));
      }, 3000);
    },
    [uploadInParts, onComplete]
  );

  const dismissDone = useCallback(() => {
    setQueue((q) => q.filter((x) => x.status === "uploading" || x.status === "queued"));
  }, []);

  return { queue, uploadFiles, dismissDone };
}
