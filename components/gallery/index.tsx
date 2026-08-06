"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GalleryToolbar } from "./toolbar";
import { GalleryGrid } from "./gallery-grid";
import { GalleryList } from "./gallery-list";
import { UploadQueue, type QueueItem } from "./upload-queue";
import { Breadcrumbs } from "./breadcrumbs";
import { DragDropOverlay } from "./drag-drop-overlay";
import { SelectionBar } from "./selection-bar";
import { ContextMenu } from "./context-menu";
import { EmptyState } from "./empty-state";
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
  const [hasMore, setHasMore] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

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

  // Fetch with filters (incremental, not scanning Telegram)
  const fetchFiles = useCallback(async (opts?: { reset?: boolean; append?: boolean }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "48",
        offset: opts?.reset || !opts?.append ? "0" : String(files.length),
        search: query,
        mime,
        sortBy,
        sortOrder,
      });
      const res = await fetch(`/api/files?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      if (opts?.append) setFiles((prev) => [...prev, ...data.files]);
      else setFiles(data.files);
      setHasMore(data.files.length === 48 && data.total > (opts?.append ? files.length + data.files.length : data.files.length));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [query, mime, sortBy, sortOrder, files.length]);

  // Initial fetch when filters change - debounce search
  useEffect(() => {
    const t = setTimeout(() => fetchFiles({ reset: true }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mime, sortBy, sortOrder]);

  // Client-side filtered for instant UI when not re-fetching (fallback)
  const visible = useMemo(() => {
    // Server already filters; this is for optimistic UI
    return files;
  }, [files]);

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

  // Upload handling
  const uploadFiles = useCallback(async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (!arr.length) return;

    // Add to queue UI
    const items: QueueItem[] = arr.map((f) => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      size: f.size,
      progress: 0,
      status: "queued" as const,
      file: f,
    }));
    setQueue((q) => [...q, ...items]);

    // Sequential upload to avoid flooding Telegram (per spec)
    for (const item of items) {
      setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "uploading" as const } : x)));
      try {
        const fd = new FormData();
        fd.append("file", item.file);
        // Use API route which handles chunking
        const res = await fetch("/api/files", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok && !data.results) throw new Error(data.error || "Upload failed");
        // Even 207 may have partial success
        const result = data.results?.[0];
        if (result && !result.ok) throw new Error(result.error || "Upload failed");

        setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, progress: 100, status: "done" as const } : x)));
        // Refresh list incrementally without full scan
        await fetchFiles({ reset: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "error" as const, error: msg } : x)));
      }
    }

    // Auto-clear done after 3s
    setTimeout(() => {
      setQueue((q) => q.filter((x) => x.status === "uploading" || x.status === "queued"));
    }, 3000);
  }, [fetchFiles]);

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

  // Actions
  const handleDelete = async (ids: string[]) => {
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} ${ids.length === 1 ? "file" : "files"}?`)) return;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : String(e));
      }
    }
    setFiles((prev) => prev.filter((f) => !ids.includes(f.id)));
    clearSelection();
  };

  const handleDownload = async (file: ClientFile) => {
    try {
      const res = await fetch(`/api/files/${file.id}?download=1&proxy=1`);
      if (!res.ok) {
        // Fallback to redirect
        const data = (await fetch(`/api/files/${file.id}`).then((r) => r.json())) as { url?: string; urls?: string[] };
        if (data.url) window.open(data.url, "_blank");
        else if (data.urls) window.open(data.urls[0], "_blank");
        return;
      }
      // If proxied, stream to download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Download failed");
    }
  };

  const handleBulkDownload = async () => {
    for (const f of selectedFiles) await handleDownload(f);
  };

  // Infinite scroll
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          fetchFiles({ append: true });
        }
      });
      if (node) observerRef.current.observe(node);
    },
    [loading, hasMore, fetchFiles]
  );

  return (
    <div ref={dropRef} className="gallery-root">
      {/* Top bar like Finder / Drive */}
      <div className="gallery-topbar">
        <div className="gallery-topbar-left">
          <div className="gallery-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "gallery"}
              className={tab === "gallery" ? "active" : ""}
              onClick={() => setTab("gallery")}
            >
              <span className="tab-icon">◈</span> Gallery
            </button>
            <button
              role="tab"
              aria-selected={tab === "files"}
              className={tab === "files" ? "active" : ""}
              onClick={() => setTab("files")}
            >
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
          <SelectionBar
            count={selected.size}
            onDelete={() => handleDelete(Array.from(selected))}
            onDownload={handleBulkDownload}
            onClear={clearSelection}
          />
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

      {/* Floating upload button (Apple-like) */}
      <motion.button
        className="fab-upload"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => fileInputRef.current?.click()}
        aria-label="Upload files"
      >
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
    </div>
  );
}
