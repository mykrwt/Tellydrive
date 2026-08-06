"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GalleryToolbar } from "./toolbar";
import { GalleryGrid } from "./gallery-grid";
import { GalleryList } from "./gallery-list";
import { GalleryViewer } from "./viewer";
import { UploadQueue, type QueueItem } from "./upload-queue";
import { Breadcrumbs } from "./breadcrumbs";
import { DragDropOverlay } from "./drag-drop-overlay";
import { SelectionBar } from "./selection-bar";
import { ContextMenu } from "./context-menu";
import { EmptyState } from "./empty-state";
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
type Tab = "gallery" | "files";

// ── Client cache: queryKey -> { data, total, expires } ──
type CacheEntry = { files: ClientFile[]; total: number; etag?: string; expires: number };
const CLIENT_CACHE = new Map<string, CacheEntry>();
const PENDING_REQUESTS = new Map<string, Promise<{ files: ClientFile[]; total: number; etag?: string }>>();
const CACHE_TTL_MS = 30_000;
const DEBOUNCE_MS = 320;

function cacheKeyFor(q: string, mime: string, sortBy: string, sortOrder: string, limit: number, offset: number) {
  return `${q}|${mime}|${sortBy}|${sortOrder}|${limit}|${offset}`;
}

// Fetch with retry on 429 (respect Retry-After), abort support, and deduplication
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

export function Gallery({ initialFiles }: { initialFiles: ClientFile[] }) {
  // State
  const [files, setFiles] = useState<ClientFile[]>(initialFiles);
  const [query, setQuery] = useState("");
  const [mime, setMime] = useState<"all" | "image" | "video">("all");
  const [sortBy, setSortBy] = useState<"date" | "name" | "size">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [view, setView] = useState<ViewMode>("grid");
  const [tab, setTab] = useState<Tab>("gallery");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [context, setContext] = useState<{ x: number; y: number; file: ClientFile } | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialFiles.length === 48);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Request coalescing / abort
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const filesLenRef = useRef(files.length);
  filesLenRef.current = files.length;

  // View persistence
  useEffect(() => {
    const saved = localStorage.getItem("tellybase:view") as ViewMode | null;
    if (saved === "grid" || saved === "list") setView(saved);
    const savedTab = localStorage.getItem("tellybase:tab") as Tab | null;
    if (savedTab === "gallery" || savedTab === "files") setTab(savedTab);
  }, []);
  useEffect(() => {
    localStorage.setItem("tellybase:view", view);
  }, [view]);
  useEffect(() => {
    localStorage.setItem("tellybase:tab", tab);
  }, [tab]);

  // Optimised fetch with client cache, dedup, abort, ETag and stale-while-revalidate
  const fetchFiles = useCallback(
    async (opts?: { reset?: boolean; append?: boolean; signal?: AbortSignal }) => {
      const isAppend = Boolean(opts?.append && !opts?.reset);
      const limit = 48;
      const offset = opts?.reset || !isAppend ? 0 : filesLenRef.current;
      const q = query.trim();
      const key = cacheKeyFor(q, mime, sortBy, sortOrder, limit, offset);

      // Serve from client cache if fresh (reset only)
      if (!isAppend) {
        const cached = CLIENT_CACHE.get(key);
        if (cached && Date.now() < cached.expires) {
          setFiles(cached.files);
          setHasMore(cached.files.length === limit && cached.total > cached.files.length);
          // Still revalidate in background (stale-while-revalidate)
          // fall through to network but don't show loading spinner
        }
      }

      // Deduplicate identical in-flight request
      if (PENDING_REQUESTS.has(key)) {
        try {
          const data = await PENDING_REQUESTS.get(key)!;
          if (opts?.signal?.aborted) return;
          if (isAppend) setFiles((prev) => [...prev, ...data.files]);
          else setFiles(data.files);
          setHasMore(data.files.length === limit && data.total > (isAppend ? offset + data.files.length : data.files.length));
          return;
        } catch {
          // fall through
        }
      }

      // Abort previous
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
        });

        // ETag: send If-None-Match if we have etag for this key
        const headers: Record<string, string> = {};
        const prevCache = CLIENT_CACHE.get(key);
        if (prevCache?.etag) headers["If-None-Match"] = prevCache.etag;

        const fetchPromise = (async () => {
          const res = await fetchWithRetry(`/api/files?${params.toString()}`, { cache: "no-store", signal, headers });
          if (res.status === 304 && prevCache) {
            // Not modified: extend TTL
            prevCache.expires = Date.now() + CACHE_TTL_MS;
            return { files: prevCache.files, total: prevCache.total, etag: prevCache.etag };
          }
          if (!res.ok) throw new Error(`Failed to load (${res.status})`);
          const data = (await res.json()) as { files: ClientFile[]; total: number };
          const etag = res.headers.get("ETag") || undefined;
          CLIENT_CACHE.set(key, { files: data.files, total: data.total, etag, expires: Date.now() + CACHE_TTL_MS });
          // LRU cap 100 keys
          if (CLIENT_CACHE.size > 100) {
            const first = CLIENT_CACHE.keys().next().value as string;
            CLIENT_CACHE.delete(first);
          }
          return { files: data.files, total: data.total, etag };
        })();

        PENDING_REQUESTS.set(key, fetchPromise);
        const data = await fetchPromise;

        // Ignore if a newer request started
        if (reqId !== requestIdRef.current) return;
        if (signal.aborted) return;

        if (isAppend) setFiles((prev) => [...prev, ...data.files]);
        else setFiles(data.files);
        setHasMore(data.files.length === limit && data.total > (isAppend ? offset + data.files.length : data.files.length));
      } catch (e: unknown) {
        if ((e as Error)?.name === "AbortError") return;
        console.error(e);
      } finally {
        PENDING_REQUESTS.delete(key);
        if (reqId === requestIdRef.current) setLoading(false);
      }
    },
    [query, mime, sortBy, sortOrder]
  );

  // Debounced fetch when filters change
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

  // Cleanup abort on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const visible = useMemo(() => files, [files]);

  // Selection
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

  const selectedFiles = useMemo(() => visible.filter((f) => selected.has(f.id)), [visible, selected]);

  const viewerFiles = useMemo(() => visible.filter((f) => f.mimeType.startsWith("image/") || f.mimeType.startsWith("video/")), [visible]);
  const openViewer = useCallback((file: ClientFile) => {
    const idx = viewerFiles.findIndex((f) => f.id === file.id);
    if (idx !== -1) setViewerIndex(idx);
  }, [viewerFiles]);
  const closeViewer = useCallback(() => setViewerIndex(null), []);

  // Upload: chunked with retry and progress throttling
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

      // Retry with backoff for 429/5xx
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
      if (!res?.ok || !data.token) {
        throw new Error(data.error || `Upload failed (part ${i + 1} of ${count})`);
      }
      tokens.push(data.token);
      const pct = Math.round(((i + 1) / count) * 95);
      // Throttle progress updates to at most every 120ms
      const now = Date.now();
      if (now - lastProgressEmit > 120 || i === count - 1) {
        lastProgressEmit = now;
        setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, progress: pct } : x)));
      }
    }

    const fin = await fetchWithRetry("/api/files/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        uploadId,
        parts: tokens,
      }),
    }, 2);
    const finData = (await fin.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!fin.ok || !finData.id) throw new Error(finData.error || "Upload failed");
  }, []);

  // Upload handling (batched sequential to avoid Telegram flood)
  const uploadFiles = useCallback(
    async (list: FileList | File[]) => {
      const arr = Array.from(list);
      if (!arr.length) return;

      const items: QueueItem[] = arr.map((f) => ({
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
            await uploadInParts(item);
          } else {
            const fd = new FormData();
            fd.append("file", item.file, item.file.name);
            const res = await fetchWithRetry("/api/files", { method: "POST", body: fd }, 2);
            const data = (await res.json().catch(() => ({}))) as { results?: Array<{ ok: boolean; error?: string }>; error?: string };
            if (!res.ok && !data.results) throw new Error(data.error || "Upload failed");
            const result = data.results?.[0];
            if (result && !result.ok) throw new Error(result.error || "Upload failed");
          }

          setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, progress: 100, status: "done" as const } : x)));
          // Invalidate client cache for this query and refetch
          CLIENT_CACHE.clear();
          PENDING_REQUESTS.clear();
          await fetchFiles({ reset: true });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "error" as const, error: msg } : x)));
        }
      }

      setTimeout(() => {
        setQueue((q) => q.filter((x) => x.status === "uploading" || x.status === "queued"));
      }, 3000);
    },
    [fetchFiles, uploadInParts]
  );

  // Drag & drop
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.target === el) setDragOver(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer?.files.length) uploadFiles(e.dataTransfer.files);
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

  // Handle paste
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files?.length) {
        const imgs = Array.from(files).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
        if (imgs.length) uploadFiles(imgs);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [uploadFiles]);

  // Actions — batched delete with concurrency, optimistic UI
  const handleDelete = async (ids: string[]) => {
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} ${ids.length === 1 ? "file" : "files"}?`)) return;
    // Optimistic: remove immediately, restore on error
    const prev = files;
    setFiles((p) => p.filter((f) => !ids.includes(f.id)));
    clearSelection();
    // Concurrency 4
    const concurrency = 4;
    const errors: string[] = [];
    for (let i = 0; i < ids.length; i += concurrency) {
      const batch = ids.slice(i, i + concurrency);
      const results = await Promise.allSettled(batch.map((id) => fetchWithRetry(`/api/files/${id}`, { method: "DELETE" }, 2)));
      results.forEach((r, idx) => {
        if (r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)) errors.push(batch[idx]);
      });
    }
    if (errors.length) {
      // Restore failed ones by refetch
      setFiles(prev);
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
      if (!res.ok) {
        const data = (await fetch(`/api/files/${file.id}`).then((r) => r.json())) as { url?: string; urls?: string[] };
        if (data.url) window.open(data.url, "_blank");
        else if (data.urls) window.open(data.urls[0], "_blank");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Download failed");
    }
  }, []);

  const handleBulkDownload = async () => {
    // Sequential to avoid browser blocking, but with small gap
    for (const f of selectedFiles) {
      await handleDownload(f);
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  // Infinite scroll — prefetch early with rootMargin 800px
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
    <div ref={dropRef} className="gallery-root">
      <div className="gallery-topbar">
        <div className="gallery-topbar-left">
          <div className="gallery-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "gallery"} className={tab === "gallery" ? "active" : ""} onClick={() => setTab("gallery")}>
              <span className="tab-icon">◈</span> Gallery
            </button>
            <button role="tab" aria-selected={tab === "files"} className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>
              <span className="tab-icon">▦</span> Files
            </button>
          </div>
          <div className="gallery-path">
            <Breadcrumbs />
          </div>
        </div>
        <div className="gallery-topbar-right">
          <button className="btn-upload" onClick={() => fileInputRef.current?.click()} aria-label="Upload">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

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
      />

      <AnimatePresence>
        {selected.size > 0 && (
          <SelectionBar count={selected.size} onDelete={() => handleDelete(Array.from(selected))} onDownload={handleBulkDownload} onClear={clearSelection} />
        )}
      </AnimatePresence>

      <div className="gallery-main">
        {visible.length === 0 && !loading ? (
          <EmptyState onUpload={() => fileInputRef.current?.click()} />
        ) : view === "grid" ? (
          <GalleryGrid
            files={visible}
            selected={selected}
            onSelect={toggleSelect}
            onContext={(e, f) => {
              e.preventDefault();
              setContext({ x: e.clientX, y: e.clientY, file: f });
            }}
            onDownload={handleDownload}
            onDelete={(f) => handleDelete([f.id])}
            onOpen={openViewer}
          />
        ) : (
          <GalleryList
            files={visible}
            selected={selected}
            onSelect={toggleSelect}
            onContext={(e, f) => {
              e.preventDefault();
              setContext({ x: e.clientX, y: e.clientY, file: f });
            }}
            onDownload={handleDownload}
            onDelete={(f) => handleDelete([f.id])}
            onOpen={openViewer}
          />
        )}
        <div ref={sentinelRef} style={{ height: 1 }} />
        {loading && (
          <div className="gallery-loading">
            <span className="spinner" /> Loading…
          </div>
        )}
      </div>

      <DragDropOverlay visible={dragOver} />
      <UploadQueue items={queue} onDismiss={() => setQueue([])} />

      <motion.button className="fab-upload" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }} onClick={() => fileInputRef.current?.click()} aria-label="Upload files">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </svg>
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
        {viewerIndex !== null && viewerFiles[viewerIndex] && (
          <GalleryViewer files={viewerFiles} index={viewerIndex} onClose={closeViewer} onChange={setViewerIndex} onDownload={handleDownload} />
        )}
      </AnimatePresence>
    </div>
  );
}
