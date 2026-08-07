"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload } from "lucide-react";
import { GalleryToolbar } from "./toolbar";
import { GalleryGrid } from "./gallery-grid";
import { GalleryList } from "./gallery-list";
import { GalleryViewer } from "./viewer";
import { UploadQueue, type QueueItem } from "./upload-queue";
import { DragDropOverlay } from "./drag-drop-overlay";
import { SelectionBar } from "./selection-bar";
import { ContextMenu } from "./context-menu";
import { EmptyState } from "./empty-state";
import { DashboardSummaryStrip, type DashboardSummaryData } from "@/components/dashboard/summary-strip";
import { PART_UPLOAD_SIZE } from "@/lib/upload-config";

export type ClientFile = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
  updatedAt?: string;
  chunked?: boolean;
  chunkCount?: number;
  folderId?: string | null;
  favorite?: boolean;
  width?: number;
  height?: number;
  duration?: number;
};

type ViewMode = "grid" | "list";

type CacheEntry = { files: ClientFile[]; total: number; etag?: string; expires: number };
const CLIENT_CACHE = new Map<string, CacheEntry>();
const PENDING_REQUESTS = new Map<string, Promise<{ files: ClientFile[]; total: number; etag?: string }>>();
const CACHE_TTL_MS = 30_000;
const DEBOUNCE_MS = 320;

function cacheKeyFor(q: string, mime: string, sortBy: string, sortOrder: string, limit: number, offset: number) {
  return `${q}|${mime}|${sortBy}|${sortOrder}|${limit}|${offset}`;
}

async function fetchWithRetry(url: string, init: RequestInit, retries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt === retries) return res;
    const ra = Number(res.headers.get("Retry-After") || "1");
    const delay = Math.min(5000, isFinite(ra) ? ra * 1000 : 800 * Math.pow(2, attempt));
    await new Promise((r) => setTimeout(r, delay + Math.random() * 200));
  }
  throw new Error("Too many requests");
}

export function Gallery({
  initialFiles,
  initialHasMore,
  initialQuery,
  initialMime,
  summary,
}: {
  initialFiles: ClientFile[];
  initialHasMore: boolean;
  initialQuery: string;
  initialMime: "all" | "image" | "video";
  summary: DashboardSummaryData;
}) {
  const [files, setFiles] = useState<ClientFile[]>(initialFiles);
  const [query, setQuery] = useState(initialQuery);
  const [mime, setMime] = useState<"all" | "image" | "video">(initialMime);
  const [sortBy, setSortBy] = useState<"date" | "name" | "size">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    const saved = (window.localStorage.getItem("tellydrive:view") || window.localStorage.getItem("tellybase:view")) as ViewMode | null;
    return saved === "grid" || saved === "list" ? saved : "grid";
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [context, setContext] = useState<{ x: number; y: number; file: ClientFile } | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const filesLenRef = useRef(files.length);

  useEffect(() => {
    filesLenRef.current = files.length;
  }, [files.length]);

  useEffect(() => {
    localStorage.setItem("tellydrive:view", view);
  }, [view]);

  const fetchFiles = useCallback(
    async (opts?: { reset?: boolean; append?: boolean; signal?: AbortSignal }) => {
      const isAppend = Boolean(opts?.append && !opts?.reset);
      const limit = 48;
      const offset = opts?.reset || !isAppend ? 0 : filesLenRef.current;
      const q = query.trim();
      const key = cacheKeyFor(q, mime, sortBy, sortOrder, limit, offset);

      if (!isAppend) {
        const cached = CLIENT_CACHE.get(key);
        if (cached && Date.now() < cached.expires) {
          setFiles(cached.files);
          setHasMore(cached.files.length === limit && cached.total > cached.files.length);
        }
      }

      if (PENDING_REQUESTS.has(key)) {
        try {
          const data = await PENDING_REQUESTS.get(key)!;
          if (opts?.signal?.aborted) return;
          if (isAppend) setFiles((prev) => [...prev, ...data.files]);
          else setFiles(data.files);
          setHasMore(data.files.length === limit && data.total > (isAppend ? offset + data.files.length : data.files.length));
          return;
        } catch {
          // continue to refetch
        }
      }

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const signal = opts?.signal || controller.signal;
      const reqId = ++requestIdRef.current;

      setLoading(true);
      try {
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
          search: q,
          mime,
          sortBy,
          sortOrder,
          media: "1",
        });
        const headers: Record<string, string> = {};
        const prevCache = CLIENT_CACHE.get(key);
        if (prevCache?.etag) headers["If-None-Match"] = prevCache.etag;

        const fetchPromise = (async () => {
          const res = await fetchWithRetry(`/api/files?${params.toString()}`, { cache: "no-store", signal, headers });
          if (res.status === 304 && prevCache) {
            prevCache.expires = Date.now() + CACHE_TTL_MS;
            return { files: prevCache.files, total: prevCache.total, etag: prevCache.etag };
          }
          if (!res.ok) throw new Error(`Failed to load (${res.status})`);
          const data = (await res.json()) as { files: ClientFile[]; total: number };
          const etag = res.headers.get("ETag") || undefined;
          CLIENT_CACHE.set(key, { files: data.files, total: data.total, etag, expires: Date.now() + CACHE_TTL_MS });
          if (CLIENT_CACHE.size > 100) {
            const first = CLIENT_CACHE.keys().next().value as string;
            CLIENT_CACHE.delete(first);
          }
          return { files: data.files, total: data.total, etag };
        })();

        PENDING_REQUESTS.set(key, fetchPromise);
        const data = await fetchPromise;
        if (reqId !== requestIdRef.current || signal.aborted) return;

        if (isAppend) setFiles((prev) => [...prev, ...data.files]);
        else setFiles(data.files);
        setHasMore(data.files.length === limit && data.total > (isAppend ? offset + data.files.length : data.files.length));
      } catch (error: unknown) {
        if ((error as Error)?.name === "AbortError") return;
        console.error(error);
      } finally {
        PENDING_REQUESTS.delete(key);
        if (reqId === requestIdRef.current) setLoading(false);
      }
    },
    [query, mime, sortBy, sortOrder]
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchFiles({ reset: true });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, mime, sortBy, sortOrder, fetchFiles]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const visible = useMemo(() => files, [files]);

  const toggleSelect = (id: string, multi?: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (!multi) next.clear();
        next.add(id);
      }
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const selectedFiles = useMemo(() => visible.filter((file) => selected.has(file.id)), [visible, selected]);
  const viewerFiles = useMemo(() => visible.filter((file) => file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/")), [visible]);

  const openViewer = useCallback((file: ClientFile) => {
    const idx = viewerFiles.findIndex((entry) => entry.id === file.id);
    if (idx !== -1) setViewerIndex(idx);
  }, [viewerFiles]);
  const closeViewer = useCallback(() => setViewerIndex(null), []);

  const uploadInParts = useCallback(async (item: QueueItem) => {
    const file = item.file;
    const count = Math.ceil(file.size / PART_UPLOAD_SIZE);
    const uploadId = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const tokens: string[] = [];
    let lastProgressEmit = 0;

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
      fd.append("source", "gallery");

      let attempt = 0;
      let res: Response | null = null;
      let data: { token?: string; error?: string } = {};
      while (attempt < 4) {
        res = await fetch("/api/files/upload-part", { method: "POST", body: fd });
        data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
        if (res.ok && data.token) break;
        if (res.status === 429 || res.status >= 500) {
          const ra = Number(res.headers.get("Retry-After") || "1");
          await new Promise((resolve) => setTimeout(resolve, Math.min(4000, (isFinite(ra) ? ra * 1000 : 600 * Math.pow(2, attempt)) + Math.random() * 200)));
          attempt++;
          continue;
        }
        break;
      }
      if (!res?.ok || !data.token) throw new Error(data.error || `Upload failed (part ${i + 1} of ${count})`);
      tokens.push(data.token);
      const pct = Math.round(((i + 1) / count) * 95);
      const now = Date.now();
      if (now - lastProgressEmit > 120 || i === count - 1) {
        lastProgressEmit = now;
        setQueue((current) => current.map((entry) => (entry.id === item.id ? { ...entry, progress: pct } : entry)));
      }
    }

    const fin = await fetchWithRetry(
      "/api/files/finalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, parts: tokens }),
      },
      2
    );
    const finData = (await fin.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!fin.ok || !finData.id) throw new Error(finData.error || "Upload failed");
  }, []);

  const uploadFiles = useCallback(
    async (list: FileList | File[]) => {
      const incoming = Array.from(list);
      if (!incoming.length) return;

      const items: QueueItem[] = incoming.map((file) => ({
        id: Math.random().toString(36).slice(2),
        name: file.name,
        size: file.size,
        progress: 0,
        status: "queued" as const,
        file,
      }));
      setQueue((current) => [...current, ...items]);

      for (const item of items) {
        setQueue((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status: "uploading" as const } : entry)));
        try {
          if (item.file.size > PART_UPLOAD_SIZE) {
            await uploadInParts(item);
          } else {
            const fd = new FormData();
            fd.append("file", item.file, item.file.name);
            fd.append("source", "gallery");
            const res = await fetchWithRetry("/api/files", { method: "POST", body: fd }, 2);
            const data = (await res.json().catch(() => ({}))) as { results?: Array<{ ok: boolean; error?: string }>; error?: string };
            if (!res.ok && !data.results) throw new Error(data.error || "Upload failed");
            const result = data.results?.[0];
            if (result && !result.ok) throw new Error(result.error || "Upload failed");
          }

          setQueue((current) => current.map((entry) => (entry.id === item.id ? { ...entry, progress: 100, status: "done" as const } : entry)));
          CLIENT_CACHE.clear();
          PENDING_REQUESTS.clear();
          await fetchFiles({ reset: true });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          setQueue((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status: "error" as const, error: message } : entry)));
        }
      }

      setTimeout(() => {
        setQueue((current) => current.filter((entry) => entry.status === "uploading" || entry.status === "queued"));
      }, 3000);
    },
    [fetchFiles, uploadInParts]
  );

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
      setDragOver(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if (event.target === el) setDragOver(false);
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      if (event.dataTransfer?.files.length) uploadFiles(event.dataTransfer.files);
    };
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [uploadFiles]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const pastedFiles = event.clipboardData?.files;
      if (pastedFiles?.length) {
        const accepted = Array.from(pastedFiles).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
        if (accepted.length) uploadFiles(accepted);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [uploadFiles]);

  const handleDelete = async (ids: string[]) => {
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} ${ids.length === 1 ? "file" : "files"}?`)) return;
    const previous = files;
    setFiles((current) => current.filter((file) => !ids.includes(file.id)));
    clearSelection();
    const concurrency = 4;
    const errors: string[] = [];
    for (let i = 0; i < ids.length; i += concurrency) {
      const batch = ids.slice(i, i + concurrency);
      const outcomes = await Promise.allSettled(batch.map((id) => fetchWithRetry(`/api/files/${id}`, { method: "DELETE" }, 2)));
      outcomes.forEach((result, index) => {
        if (result.status === "rejected" || (result.status === "fulfilled" && !result.value.ok)) errors.push(batch[index]);
      });
    }
    if (errors.length) {
      setFiles(previous);
      alert(`Failed to delete ${errors.length} file(s)`);
      CLIENT_CACHE.clear();
      await fetchFiles({ reset: true });
    } else {
      CLIENT_CACHE.clear();
    }
  };

  const handleDownload = useCallback(async (file: ClientFile) => {
    try {
      const res = await fetchWithRetry(`/api/files/${file.id}?download=1&proxy=1`, {}, 1);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Download failed");
    }
  }, []);

  const handleBulkDownload = async () => {
    for (const file of selectedFiles) {
      await handleDownload(file);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  };

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore && !loading) {
            fetchFiles({ append: true });
          }
        },
        { rootMargin: "800px" }
      );
      if (node) observerRef.current.observe(node);
    },
    [loading, hasMore, fetchFiles]
  );

  return (
    <div ref={dropRef} className="tb-gallery-page">
      <section className="tb-page-intro compact">
        <div>
          <span className="tb-eyebrow">Gallery</span>
          <h1>All your visuals, organized by date.</h1>
          <p>Browse photos and videos with quick previews, instant filtering, and lightweight upload controls.</p>
        </div>
      </section>

      <DashboardSummaryStrip summary={summary} />

      <GalleryToolbar
        query={query}
        onQuery={setQuery}
        mime={mime}
        onMime={setMime}
        sortBy={sortBy}
        onSortBy={setSortBy}
        sortOrder={sortOrder}
        onSortOrder={setSortOrder}
        view={view}
        onView={setView}
        count={visible.length}
        onUpload={() => fileInputRef.current?.click()}
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        style={{ display: "none" }}
        onChange={(event) => {
          if (event.target.files) uploadFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <AnimatePresence>
        {selected.size > 0 && (
          <SelectionBar count={selected.size} onDelete={() => handleDelete(Array.from(selected))} onDownload={handleBulkDownload} onClear={clearSelection} />
        )}
      </AnimatePresence>

      <section className="tb-content-surface gallery">
        {visible.length === 0 && !loading ? (
          <EmptyState onUpload={() => fileInputRef.current?.click()} />
        ) : view === "grid" ? (
          <GalleryGrid
            files={visible}
            selected={selected}
            onSelect={toggleSelect}
            onContext={(event, file) => {
              event.preventDefault();
              setContext({ x: event.clientX, y: event.clientY, file });
            }}
            onDownload={handleDownload}
            onDelete={(file) => handleDelete([file.id])}
            onOpen={openViewer}
          />
        ) : (
          <GalleryList
            files={visible}
            selected={selected}
            onSelect={toggleSelect}
            onContext={(event, file) => {
              event.preventDefault();
              setContext({ x: event.clientX, y: event.clientY, file });
            }}
            onDownload={handleDownload}
            onDelete={(file) => handleDelete([file.id])}
            onOpen={openViewer}
          />
        )}

        {loading && visible.length === 0 ? <GallerySkeleton /> : null}
        <div ref={sentinelRef} style={{ height: 1 }} />
        {loading && visible.length > 0 ? (
          <div className="gallery-loading tb-loading-inline">
            <span className="spinner" /> Loading more media…
          </div>
        ) : null}
      </section>

      <DragDropOverlay visible={dragOver} />
      <UploadQueue items={queue} onDismiss={() => setQueue([])} />

      <motion.button className="fab-upload tb-mobile-upload" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }} onClick={() => fileInputRef.current?.click()} aria-label="Upload files">
        <Upload size={22} strokeWidth={2.4} />
      </motion.button>

      {context && (
        <ContextMenu
          x={context.x}
          y={context.y}
          file={context.file}
          onClose={() => setContext(null)}
          onDownload={() => {
            handleDownload(context.file);
            setContext(null);
          }}
          onDelete={() => {
            handleDelete([context.file.id]);
            setContext(null);
          }}
          onToggleSelect={() => {
            toggleSelect(context.file.id, true);
            setContext(null);
          }}
        />
      )}

      <AnimatePresence>
        {viewerIndex !== null && viewerFiles[viewerIndex] ? (
          <GalleryViewer key={viewerFiles[viewerIndex].id} files={viewerFiles} index={viewerIndex} onClose={closeViewer} onChange={setViewerIndex} onDownload={handleDownload} />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function GallerySkeleton() {
  return (
    <div className="tb-gallery-skeleton-grid" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="tb-gallery-skeleton-card" />
      ))}
    </div>
  );
}
