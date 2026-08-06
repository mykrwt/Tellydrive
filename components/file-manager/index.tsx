"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ClientFile, ClientFolder } from "./helpers";
import { fileKind, formatBytes, formatDate, getFileKindMeta, fileExtension } from "./helpers";
import { FileManagerContextMenu, type MenuTarget } from "./context-menu";
import { NewFolderDialog, RenameDialog, MoveDialog, DeleteDialog, PreviewDialog, type DialogState } from "./dialogs";
import { useUploader, type UploadItem } from "./use-uploader";

type ViewMode = "grid" | "list";
type SortKey = "name" | "size" | "date";
type SortOrder = "asc" | "desc";
type CategoryFilter = "all" | "folders" | "documents" | "media" | "audio" | "archives";

type ApiData = {
  error?: string;
  folders?: ClientFolder[];
  files?: ClientFile[];
  path?: ClientFolder[];
  folder?: ClientFolder | null;
} | null;

async function api(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: ApiData }> {
  const res = await fetch(path, init);
  let data: ApiData = null;
  try {
    data = (await res.json()) as ApiData;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

function apiError(res: { ok: boolean; data: ApiData }, fallback: string): Error {
  return new Error(res.data?.error || fallback);
}

export function FileManager({
  initialFolders,
  initialFiles,
  initialPath,
}: {
  initialFolders: ClientFolder[];
  initialFiles: ClientFile[];
  initialPath: ClientFolder[];
}) {
  // ── Navigation state ──
  const [cwd, setCwd] = useState<string | null>(null);
  const [path, setPath] = useState<ClientFolder[]>(initialPath);
  const [folders, setFolders] = useState<ClientFolder[]>(initialFolders);
  const [files, setFiles] = useState<ClientFile[]>(initialFiles);
  const [loading, setLoading] = useState(false);

  // ── View & filter state ──
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    const saved = window.localStorage.getItem("tellydrive:fm-view") || window.localStorage.getItem("tellybase:fm-view");
    return saved === "grid" || saved === "list" ? saved : "grid";
  });
  const [sortBy, setSortBy] = useState<SortKey>(() => {
    if (typeof window === "undefined") return "name";
    const saved = window.localStorage.getItem("tellydrive:fm-sort") || window.localStorage.getItem("tellybase:fm-sort");
    if (saved) {
      const by = saved.split("-")[0] as SortKey;
      if (["name", "size", "date"].includes(by)) return by;
    }
    return "name";
  });
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    if (typeof window === "undefined") return "asc";
    const saved = window.localStorage.getItem("tellydrive:fm-sort") || window.localStorage.getItem("tellybase:fm-sort");
    const order = saved?.split("-")[1] as SortOrder | undefined;
    return order === "asc" || order === "desc" ? order : "asc";
  });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");

  // ── Selection / UI state ──
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [context, setContext] = useState<{ x: number; y: number; target: MenuTarget } | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef(0);

  // ── Persistence ──
  useEffect(() => {
    localStorage.setItem("tellydrive:fm-view", view);
  }, [view]);
  useEffect(() => {
    localStorage.setItem("tellydrive:fm-sort", `${sortBy}-${sortOrder}`);
  }, [sortBy, sortOrder]);

  // ── Load folder contents ──
  const loadFolder = useCallback(async (folderId: string | null) => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const folderScope = folderId ? `parentId=${encodeURIComponent(folderId)}` : "root=1";
      const fileScope = folderId ? `folderId=${encodeURIComponent(folderId)}` : "root=1";
      const [folderRes, fileRes, pathRes] = await Promise.all([
        api(`/api/folders?${folderScope}`),
        api(`/api/files?${fileScope}&section=files&limit=500&sortBy=name&sortOrder=asc`),
        folderId ? api(`/api/folders/${encodeURIComponent(folderId)}`) : Promise.resolve(null),
      ]);
      if (reqId !== reqIdRef.current) return;
      if (!folderRes.ok) throw apiError(folderRes, "Failed to load folders");
      if (!fileRes.ok) throw apiError(fileRes, "Failed to load files");
      setFolders(folderRes.data?.folders ?? []);
      setFiles(fileRes.data?.files ?? []);
      if (pathRes && pathRes.ok) setPath(pathRes.data?.path ?? []);
      else if (!folderId) setPath([]);
    } catch (e: unknown) {
      if (reqId === reqIdRef.current) setNotice(e instanceof Error ? e.message : "Failed to load folder");
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, []);

  const openFolder = useCallback(
    (folder: ClientFolder) => {
      setCwd(folder.id);
      setSelectedFolders(new Set());
      setSelectedFiles(new Set());
      setSearch("");
      setCategory("all");
      setDialog(null);
      void loadFolder(folder.id);
    },
    [loadFolder]
  );

  const goToPath = useCallback(
    (index: number) => {
      if (index < 0) {
        setCwd(null);
        setPath([]);
        void loadFolder(null);
      } else {
        const folder = path[index];
        if (folder) openFolder(folder);
      }
      setSelectedFolders(new Set());
      setSelectedFiles(new Set());
    },
    [path, loadFolder, openFolder]
  );

  const goUpOneLevel = useCallback(() => {
    if (path.length <= 1) {
      goToPath(-1);
    } else {
      goToPath(path.length - 2);
    }
  }, [path, goToPath]);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 4000);
  }, []);

  // ── Category Counts ──
  const categoryCounts = useMemo(() => {
    let docs = 0;
    let media = 0;
    let audio = 0;
    let archives = 0;

    for (const f of files) {
      const k = fileKind(f.mimeType, f.name);
      if (k === "document" || k === "code") docs++;
      else if (k === "image" || k === "video") media++;
      else if (k === "audio") audio++;
      else if (k === "archive") archives++;
      else docs++;
    }

    return {
      all: folders.length + files.length,
      folders: folders.length,
      documents: docs,
      media,
      audio,
      archives,
    };
  }, [folders, files]);

  // ── Sorting / filtering (client-side) ──
  const visibleFolders = useMemo(() => {
    if (category !== "all" && category !== "folders") return [];
    let out = folders.slice();
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((f) => f.name.toLowerCase().includes(q));
    out.sort((a, b) => {
      let cmp = a.name.localeCompare(b.name);
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return out;
  }, [folders, search, category, sortOrder]);

  const visibleFiles = useMemo(() => {
    if (category === "folders") return [];
    let out = files.slice();

    if (category !== "all") {
      out = out.filter((f) => {
        const k = fileKind(f.mimeType, f.name);
        if (category === "documents") return k === "document" || k === "code" || k === "other";
        if (category === "media") return k === "image" || k === "video";
        if (category === "audio") return k === "audio";
        if (category === "archives") return k === "archive";
        return true;
      });
    }

    const q = search.trim().toLowerCase();
    if (q) out = out.filter((f) => f.name.toLowerCase().includes(q));

    out.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "size") cmp = a.size - b.size;
      else cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return out;
  }, [files, search, category, sortBy, sortOrder]);

  // ── Total Bytes ──
  const totalFolderBytes = useMemo(() => {
    return visibleFiles.reduce((acc, curr) => acc + (curr.size || 0), 0);
  }, [visibleFiles]);

  // ── Selection ──
  const clearSelection = () => {
    setSelectedFiles(new Set());
    setSelectedFolders(new Set());
  };

  const toggleFile = (id: string, multi?: boolean) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (!multi) next.clear();
        next.add(id);
      }
      return next;
    });
    if (!multi) setSelectedFolders(new Set());
  };

  const toggleFolder = (id: string, multi?: boolean) => {
    setSelectedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (!multi) next.clear();
        next.add(id);
      }
      return next;
    });
    if (!multi) setSelectedFiles(new Set());
  };

  // ── Upload ──
  const { queue, uploadFiles, dismissDone } = useUploader(async () => {
    await loadFolder(cwd);
  });

  const onDropUpload = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer?.files?.length) void uploadFiles(e.dataTransfer.files, cwd);
    },
    [uploadFiles, cwd]
  );

  // ── Folder CRUD ──
  const createFolder = useCallback(
    async (name: string) => {
      const res = await api("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: cwd }),
      });
      if (!res.ok) throw apiError(res, "Could not create folder");
      showNotice(`Folder “${name}” created`);
      await loadFolder(cwd);
    },
    [cwd, loadFolder, showNotice]
  );

  const renameTarget = useCallback(
    async (target: MenuTarget, name: string) => {
      if (target.type === "folder") {
        const res = await api(`/api/folders/${encodeURIComponent(target.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw apiError(res, "Could not rename folder");
      } else {
        const res = await api(`/api/files/${encodeURIComponent(target.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw apiError(res, "Could not rename file");
      }
      showNotice("Item renamed");
      await loadFolder(cwd);
    },
    [cwd, loadFolder, showNotice]
  );

  const moveTarget = useCallback(
    async (target: MenuTarget, destinationId: string | null) => {
      if (target.type === "folder") {
        const res = await api(`/api/folders/${encodeURIComponent(target.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId: destinationId }),
        });
        if (!res.ok) throw apiError(res, "Could not move folder");
      } else {
        const res = await api(`/api/files/${encodeURIComponent(target.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: destinationId }),
        });
        if (!res.ok) throw apiError(res, "Could not move file");
      }
      await loadFolder(cwd);
    },
    [cwd, loadFolder]
  );

  const deleteTargets = useCallback(
    async (targets: MenuTarget[]) => {
      const folderIds = targets.filter((t) => t.type === "folder").map((t) => t.id);
      const fileIds = targets.filter((t) => t.type === "file").map((t) => t.id);
      try {
        for (const id of folderIds) {
          const res = await api(`/api/folders/${encodeURIComponent(id)}`, { method: "DELETE" });
          if (!res.ok) throw apiError(res, "Could not delete folder");
        }
        for (const id of fileIds) {
          const res = await api(`/api/files/${encodeURIComponent(id)}`, { method: "DELETE" });
          if (!res.ok) throw apiError(res, "Could not delete file");
        }
        clearSelection();
        showNotice(`${targets.length} ${targets.length === 1 ? "item" : "items"} deleted`);
        await loadFolder(cwd);
      } catch (e: unknown) {
        showNotice(e instanceof Error ? e.message : "Delete failed");
      }
    },
    [cwd, loadFolder, showNotice]
  );

  // ── Download / preview ──
  const downloadFile = useCallback(async (file: ClientFile) => {
    try {
      const res = await fetch(`/api/files/${file.id}?download=1&proxy=1`, { cache: "no-store" });
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
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : "Download failed");
    }
  }, []);

  const downloadMultiple = useCallback(async (targets: MenuTarget[]) => {
    const fileTargets = targets.filter((t) => t.type === "file") as Array<{ type: "file"; id: string; name: string }>;
    for (const t of fileTargets) {
      const f = files.find((x) => x.id === t.id);
      if (f) {
        await downloadFile(f);
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }, [files, downloadFile]);

  // ── Context menu ──
  const menuTargets: MenuTarget[] = useMemo(() => {
    const out: MenuTarget[] = [];
    for (const id of selectedFolders) {
      const f = folders.find((x) => x.id === id);
      if (f) out.push({ type: "folder", id: f.id, name: f.name });
    }
    for (const id of selectedFiles) {
      const f = files.find((x) => x.id === id);
      if (f) out.push({ type: "file", id: f.id, name: f.name, mimeType: f.mimeType, size: f.size });
    }
    return out;
  }, [selectedFolders, selectedFiles, folders, files]);

  const totalSelected = selectedFolders.size + selectedFiles.size;

  const openFile = useCallback((file: ClientFile) => {
    const kind = fileKind(file.mimeType, file.name);
    if (kind === "image" || kind === "video" || kind === "audio") {
      setDialog({ type: "preview", file });
    } else {
      void downloadFile(file);
    }
  }, [downloadFile]);

  const currentFolderName = path.length ? path[path.length - 1].name : "My Files";

  return (
    <div
      ref={dropRef}
      className="fm-root"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.target === dropRef.current) setDragOver(false);
      }}
      onDrop={onDropUpload}
    >
      {/* Topbar: Path, Title, and Primary Action Buttons */}
      <div className="fm-topbar-header">
        <div className="fm-topbar-path-area">
          <div className="fm-page-title-row">
            <div className="fm-title-badge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="fm-page-title">{cwd === null ? "My Files" : currentFolderName}</h1>
              <p className="fm-page-desc">
                {cwd === null ? "Cloud storage drive · Folders & documents" : `Inside folder: ${currentFolderName}`}
              </p>
            </div>
          </div>

          {/* Breadcrumb Navigation Trail */}
          <nav className="fm-breadcrumbs-wrap" aria-label="Breadcrumb path">
            {cwd !== null && (
              <button
                type="button"
                className="fm-back-btn"
                onClick={goUpOneLevel}
                aria-label="Go up one folder"
                title="Go up one folder"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M19 12H5" />
                  <path d="M12 19l-7-7 7-7" />
                </svg>
                <span>Back</span>
              </button>
            )}
            <ol className="fm-breadcrumbs-list">
              <li>
                <button
                  type="button"
                  className={`fm-crumb-btn ${cwd === null ? "active" : ""}`}
                  onClick={() => goToPath(-1)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                  <span>My Files</span>
                </button>
              </li>
              {path.map((folder, i) => (
                <li key={folder.id} className="fm-crumb-node">
                  <span aria-hidden="true" className="fm-crumb-sep">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </span>
                  <button
                    type="button"
                    className={`fm-crumb-btn ${i === path.length - 1 ? "active" : ""}`}
                    onClick={() => goToPath(i)}
                    title={folder.name}
                  >
                    <span>{folder.name}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        {/* Top Right Action Buttons */}
        <div className="fm-topbar-actions">
          <button
            className="btn-fm-action btn-fm-secondary"
            onClick={() => setDialog({ type: "new-folder" })}
            aria-label="Create new folder"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <path d="M12 11v6" />
              <path d="M9 14h6" />
            </svg>
            <span>New folder</span>
          </button>
          <button
            className="btn-fm-action btn-fm-primary"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload files"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Upload files</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files) void uploadFiles(e.target.files, cwd);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* Category Filter Chips Bar */}
      <div className="fm-category-bar">
        <div className="fm-category-chips" role="tablist" aria-label="Filter by file type">
          <button
            role="tab"
            aria-selected={category === "all"}
            className={`fm-chip ${category === "all" ? "active" : ""}`}
            onClick={() => setCategory("all")}
          >
            <span>All Items</span>
            <span className="fm-chip-count">{categoryCounts.all}</span>
          </button>

          {categoryCounts.folders > 0 && (
            <button
              role="tab"
              aria-selected={category === "folders"}
              className={`fm-chip ${category === "folders" ? "active" : ""}`}
              onClick={() => setCategory("folders")}
            >
              <span>Folders</span>
              <span className="fm-chip-count">{categoryCounts.folders}</span>
            </button>
          )}

          <button
            role="tab"
            aria-selected={category === "documents"}
            className={`fm-chip ${category === "documents" ? "active" : ""}`}
            onClick={() => setCategory("documents")}
          >
            <span>Documents</span>
            {categoryCounts.documents > 0 && <span className="fm-chip-count">{categoryCounts.documents}</span>}
          </button>

          <button
            role="tab"
            aria-selected={category === "media"}
            className={`fm-chip ${category === "media" ? "active" : ""}`}
            onClick={() => setCategory("media")}
          >
            <span>Media</span>
            {categoryCounts.media > 0 && <span className="fm-chip-count">{categoryCounts.media}</span>}
          </button>

          <button
            role="tab"
            aria-selected={category === "audio"}
            className={`fm-chip ${category === "audio" ? "active" : ""}`}
            onClick={() => setCategory("audio")}
          >
            <span>Audio</span>
            {categoryCounts.audio > 0 && <span className="fm-chip-count">{categoryCounts.audio}</span>}
          </button>

          <button
            role="tab"
            aria-selected={category === "archives"}
            className={`fm-chip ${category === "archives" ? "active" : ""}`}
            onClick={() => setCategory("archives")}
          >
            <span>Archives</span>
            {categoryCounts.archives > 0 && <span className="fm-chip-count">{categoryCounts.archives}</span>}
          </button>
        </div>
      </div>

      {/* Toolbar: Search, Sort, Stats & View Toggles */}
      <div className="fm-toolbar">
        <div className="fm-toolbar-left">
          <div className="fm-search-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              placeholder="Filter files by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Filter files"
            />
            {search && (
              <button className="clear-search" onClick={() => setSearch("")} aria-label="Clear filter">
                ×
              </button>
            )}
          </div>

          <div className="fm-stats-pill">
            <span>
              {visibleFolders.length > 0 && `${visibleFolders.length} ${visibleFolders.length === 1 ? "folder" : "folders"}`}
              {visibleFolders.length > 0 && visibleFiles.length > 0 && " • "}
              {visibleFiles.length > 0 && `${visibleFiles.length} ${visibleFiles.length === 1 ? "file" : "files"}`}
              {visibleFiles.length > 0 && ` (${formatBytes(totalFolderBytes)})`}
              {visibleFolders.length === 0 && visibleFiles.length === 0 && "0 items"}
            </span>
          </div>
        </div>

        <div className="fm-toolbar-right">
          <div className="fm-sort-wrap">
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [by, order] = e.target.value.split("-") as [SortKey, SortOrder];
                setSortBy(by);
                setSortOrder(order);
              }}
              aria-label="Sort files"
              className="fm-sort-select"
            >
              <option value="name-asc">Name (A–Z)</option>
              <option value="name-desc">Name (Z–A)</option>
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="size-desc">Largest first</option>
              <option value="size-asc">Smallest first</option>
            </select>
          </div>

          <div className="view-toggle" role="group" aria-label="View toggle">
            <button
              type="button"
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={view === "grid" ? "active" : ""}
              onClick={() => setView("grid")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="List view"
              aria-pressed={view === "list"}
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 6h13" />
                <path d="M8 12h13" />
                <path d="M8 18h13" />
                <path d="M3 6h.01" />
                <path d="M3 12h.01" />
                <path d="M3 18h.01" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Selection Bar */}
      <AnimatePresence>
        {totalSelected > 0 && (
          <SelectionBar
            count={totalSelected}
            onDownload={() => void downloadMultiple(menuTargets)}
            onMove={() => setDialog({ type: "move", targets: menuTargets })}
            onDelete={() => setDialog({ type: "delete", targets: menuTargets })}
            onClear={clearSelection}
          />
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="fm-main">
        {!loading && visibleFolders.length === 0 && visibleFiles.length === 0 ? (
          <div className="empty-state fm-empty-card">
            <div className="empty-illustration">
              <div className="empty-stack">
                <span />
                <span />
                <span />
              </div>
              <div className="empty-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
            </div>
            <h3>{cwd === null ? "Your Files Drive is Empty" : "This folder is empty"}</h3>
            <p>
              {cwd === null
                ? "Organize your documents, archives, code, audio, and more by creating folders or uploading files."
                : "Create a subfolder or drag & drop files here to upload directly."}
            </p>
            <div className="fm-empty-actions">
              <button className="btn-fm-action btn-fm-secondary" onClick={() => setDialog({ type: "new-folder" })}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  <path d="M12 11v6" />
                  <path d="M9 14h6" />
                </svg>
                New folder
              </button>
              <button className="btn-fm-action btn-fm-primary" onClick={() => fileInputRef.current?.click()}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload files
              </button>
            </div>
          </div>
        ) : view === "grid" ? (
          <div className="fm-grid-section">
            {/* Folders Section in Grid */}
            {visibleFolders.length > 0 && (
              <div className="fm-group-section">
                <div className="fm-group-header">
                  <h3>Folders</h3>
                  <span className="fm-group-count">{visibleFolders.length}</span>
                </div>
                <div className="fm-folders-grid">
                  {visibleFolders.map((folder) => (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      selected={selectedFolders.has(folder.id)}
                      onOpen={() => openFolder(folder)}
                      onSelect={(multi) => toggleFolder(folder.id, multi)}
                      onContext={(e) => {
                        e.preventDefault();
                        if (!selectedFolders.has(folder.id)) {
                          clearSelection();
                          toggleFolder(folder.id, false);
                        }
                        setContext({
                          x: e.clientX,
                          y: e.clientY,
                          target: { type: "folder", id: folder.id, name: folder.name, itemCount: folder.itemCount },
                        });
                      }}
                      onTriggerMenu={(pos) => {
                        if (!selectedFolders.has(folder.id)) {
                          clearSelection();
                          toggleFolder(folder.id, false);
                        }
                        setContext({
                          x: pos.x,
                          y: pos.y,
                          target: { type: "folder", id: folder.id, name: folder.name, itemCount: folder.itemCount },
                        });
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Files Section in Grid */}
            {visibleFiles.length > 0 && (
              <div className="fm-group-section">
                {visibleFolders.length > 0 && (
                  <div className="fm-group-header">
                    <h3>Files</h3>
                    <span className="fm-group-count">{visibleFiles.length}</span>
                  </div>
                )}
                <div className="fm-files-grid">
                  {visibleFiles.map((file) => (
                    <FileCard
                      key={file.id}
                      file={file}
                      selected={selectedFiles.has(file.id)}
                      onSelect={(multi) => toggleFile(file.id, multi)}
                      onOpen={() => openFile(file)}
                      onDownload={() => void downloadFile(file)}
                      onContext={(e) => {
                        e.preventDefault();
                        if (!selectedFiles.has(file.id)) {
                          clearSelection();
                          toggleFile(file.id, false);
                        }
                        setContext({
                          x: e.clientX,
                          y: e.clientY,
                          target: { type: "file", id: file.id, name: file.name, mimeType: file.mimeType, size: file.size },
                        });
                      }}
                      onTriggerMenu={(pos) => {
                        if (!selectedFiles.has(file.id)) {
                          clearSelection();
                          toggleFile(file.id, false);
                        }
                        setContext({
                          x: pos.x,
                          y: pos.y,
                          target: { type: "file", id: file.id, name: file.name, mimeType: file.mimeType, size: file.size },
                        });
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <FileTableList
            folders={visibleFolders}
            files={visibleFiles}
            selectedFolders={selectedFolders}
            selectedFiles={selectedFiles}
            onOpenFolder={(f) => openFolder(f)}
            onOpenFile={(f) => openFile(f)}
            onToggleFolder={(id, multi) => toggleFolder(id, multi)}
            onToggleFile={(id, multi) => toggleFile(id, multi)}
            onDownload={(f) => void downloadFile(f)}
            onContext={(e, target) => {
              e.preventDefault();
              const isFolder = target.type === "folder";
              const sel = isFolder ? selectedFolders : selectedFiles;
              if (!sel.has(target.id)) {
                clearSelection();
                if (isFolder) toggleFolder(target.id, false);
                else toggleFile(target.id, false);
              }
              setContext({ x: e.clientX, y: e.clientY, target });
            }}
            onTriggerMenu={(pos, target) => {
              const isFolder = target.type === "folder";
              const sel = isFolder ? selectedFolders : selectedFiles;
              if (!sel.has(target.id)) {
                clearSelection();
                if (isFolder) toggleFolder(target.id, false);
                else toggleFile(target.id, false);
              }
              setContext({ x: pos.x, y: pos.y, target });
            }}
          />
        )}

        {loading && (
          <div className="gallery-loading">
            <span className="spinner" /> Loading files…
          </div>
        )}
      </div>

      {/* Mobile Floating Action Button */}
      <motion.button
        className="fab-upload fm-mobile-fab"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => fileInputRef.current?.click()}
        aria-label="Upload files"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </svg>
      </motion.button>

      {/* Drag & drop overlay */}
      <AnimatePresence>
        {dragOver && (
          <motion.div
            className="drag-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropUpload}
          >
            <div className="drag-card">
              <div className="drag-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <h3>Drop to upload files</h3>
              <p>Uploading to “{currentFolderName}”</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload queue */}
      {queue.length > 0 && <UploadQueue items={queue} onDismiss={dismissDone} />}

      {/* Context menu */}
      {context && (
        <FileManagerContextMenu
          x={context.x}
          y={context.y}
          target={context.target}
          onClose={() => setContext(null)}
          onOpen={() => {
            const t = context.target;
            if (t.type === "folder") {
              const f = folders.find((x) => x.id === t.id);
              if (f) openFolder(f);
            } else {
              const f = files.find((x) => x.id === t.id);
              if (f) openFile(f);
            }
            setContext(null);
          }}
          onDownload={() => {
            const t = context.target;
            if (t.type === "file") {
              const f = files.find((x) => x.id === t.id);
              if (f) void downloadFile(f);
            }
            setContext(null);
          }}
          onRename={() => {
            setDialog({ type: "rename", target: context.target });
            setContext(null);
          }}
          onMove={() => {
            setDialog({ type: "move", targets: [context.target] });
            setContext(null);
          }}
          onDelete={() => {
            setDialog({ type: "delete", targets: [context.target] });
            setContext(null);
          }}
        />
      )}

      {/* Dialogs */}
      {dialog?.type === "new-folder" && (
        <NewFolderDialog
          parentName={currentFolderName}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            try {
              await createFolder(name);
              setDialog(null);
            } catch (e: unknown) {
              showNotice(e instanceof Error ? e.message : "Could not create folder");
            }
          }}
        />
      )}
      {dialog?.type === "rename" && (
        <RenameDialog
          target={dialog.target}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            try {
              await renameTarget(dialog.target, name);
              setDialog(null);
            } catch (e: unknown) {
              showNotice(e instanceof Error ? e.message : "Rename failed");
            }
          }}
        />
      )}
      {dialog?.type === "move" && (
        <MoveDialog
          targets={dialog.targets}
          currentFolderId={cwd}
          onClose={() => setDialog(null)}
          onSubmit={async (destinationId) => {
            try {
              for (const t of dialog.targets) await moveTarget(t, destinationId);
              clearSelection();
              setDialog(null);
              showNotice(
                `${dialog.targets.length} ${dialog.targets.length === 1 ? "item" : "items"} moved`
              );
            } catch (e: unknown) {
              showNotice(e instanceof Error ? e.message : "Move failed");
            }
          }}
        />
      )}
      {dialog?.type === "delete" && (
        <DeleteDialog
          targets={dialog.targets}
          onClose={() => setDialog(null)}
          onSubmit={async () => {
            await deleteTargets(dialog.targets);
            setDialog(null);
          }}
        />
      )}
      {dialog?.type === "preview" && dialog.file && (
        <PreviewDialog
          file={dialog.file}
          onClose={() => setDialog(null)}
          onDownload={() => void downloadFile(dialog.file)}
        />
      )}

      {/* Notice Toast */}
      <AnimatePresence>
        {notice && (
          <motion.div
            className="fm-notice"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────

function FolderCard({
  folder,
  selected,
  onOpen,
  onSelect,
  onContext,
  onTriggerMenu,
}: {
  folder: ClientFolder;
  selected: boolean;
  onOpen: () => void;
  onSelect: (multi?: boolean) => void;
  onContext: (e: React.MouseEvent) => void;
  onTriggerMenu: (pos: { x: number; y: number }) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`fm-folder-card ${selected ? "selected" : ""}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          onSelect(true);
        } else {
          onOpen();
        }
      }}
      onDoubleClick={onOpen}
      onContextMenu={onContext}
      role="button"
      tabIndex={0}
      aria-label={`Folder ${folder.name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
    >
      <div className="fm-folder-card-top">
        <div className="fm-folder-icon-wrap">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </div>

        <div className="fm-card-controls">
          <button
            type="button"
            className={`fm-select-check ${selected ? "checked" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(true);
            }}
            aria-label={selected ? "Deselect folder" : "Select folder"}
          >
            {selected && "✓"}
          </button>
          <button
            type="button"
            className="fm-more-btn"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              onTriggerMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
            aria-label="Folder options"
          >
            •••
          </button>
        </div>
      </div>

      <div className="fm-folder-card-body">
        <span className="fm-folder-title" title={folder.name}>
          {folder.name}
        </span>
        <span className="fm-folder-count">
          {folder.itemCount ?? 0} {folder.itemCount === 1 ? "item" : "items"}
        </span>
      </div>
    </motion.div>
  );
}

function FileCard({
  file,
  selected,
  onSelect,
  onOpen,
  onDownload,
  onContext,
  onTriggerMenu,
}: {
  file: ClientFile;
  selected: boolean;
  onSelect: (multi?: boolean) => void;
  onOpen: () => void;
  onDownload: () => void;
  onContext: (e: React.MouseEvent) => void;
  onTriggerMenu: (pos: { x: number; y: number }) => void;
}) {
  const kind = fileKind(file.mimeType, file.name);
  const meta = getFileKindMeta(file.mimeType, file.name);
  const isImageOrVideo = kind === "image" || kind === "video";
  const ext = fileExtension(file.name).toUpperCase();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`fm-file-card ${selected ? "selected" : ""}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          onSelect(true);
        } else if (isImageOrVideo || kind === "audio") {
          onOpen();
        } else {
          onSelect(false);
        }
      }}
      onDoubleClick={onOpen}
      onContextMenu={onContext}
      role="button"
      tabIndex={0}
      aria-label={file.name}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
    >
      {/* Top Media / Thumbnail Preview */}
      <div className="fm-file-preview-wrap">
        {isImageOrVideo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/files/${file.id}?thumbnail=1`}
            alt=""
            loading="lazy"
            decoding="async"
            className="fm-file-img"
          />
        ) : (
          <div className="fm-file-type-display" style={{ backgroundColor: meta.bg }}>
            <div className="fm-file-type-badge" style={{ color: meta.accent, borderColor: meta.border }}>
              {meta.label || ext || "FILE"}
            </div>
            <div className="fm-file-icon-svg" style={{ color: meta.accent }}>
              {kind === "audio" ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              ) : kind === "archive" ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21 8v13H3V8" />
                  <path d="M1 3h22v5H1z" />
                  <path d="M10 12h4" />
                </svg>
              ) : kind === "code" ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              )}
            </div>
          </div>
        )}

        {kind === "video" && (
          <span className="fm-video-indicator" aria-label="Video">
            ▶
          </span>
        )}

        {/* Card hover controls */}
        <div className="fm-card-controls">
          <button
            type="button"
            className={`fm-select-check ${selected ? "checked" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(true);
            }}
            aria-label={selected ? "Deselect file" : "Select file"}
          >
            {selected && "✓"}
          </button>
          <button
            type="button"
            className="fm-more-btn"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              onTriggerMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
            aria-label="File options"
          >
            •••
          </button>
        </div>
      </div>

      {/* Card Info */}
      <div className="fm-card-info">
        <span className="fm-file-title" title={file.name}>
          {file.name}
        </span>
        <div className="fm-file-sub-row">
          <span className="fm-file-size">{formatBytes(file.size)}</span>
          <span className="fm-file-date">{formatDate(file.createdAt)}</span>
          {file.chunked && <span className="mini-badge">chunked</span>}
        </div>
      </div>
    </motion.div>
  );
}

function FileTableList({
  folders,
  files,
  selectedFolders,
  selectedFiles,
  onOpenFolder,
  onOpenFile,
  onToggleFolder,
  onToggleFile,
  onDownload,
  onContext,
  onTriggerMenu,
}: {
  folders: ClientFolder[];
  files: ClientFile[];
  selectedFolders: Set<string>;
  selectedFiles: Set<string>;
  onOpenFolder: (f: ClientFolder) => void;
  onOpenFile: (f: ClientFile) => void;
  onToggleFolder: (id: string, multi?: boolean) => void;
  onToggleFile: (id: string, multi?: boolean) => void;
  onDownload: (f: ClientFile) => void;
  onContext: (e: React.MouseEvent, target: MenuTarget) => void;
  onTriggerMenu: (pos: { x: number; y: number }, target: MenuTarget) => void;
}) {
  return (
    <div className="fm-table-wrap" role="table" aria-label="Files list">
      <div className="fm-table-head" role="row">
        <span role="columnheader" className="fm-col-check" />
        <span role="columnheader" className="fm-col-name">Name</span>
        <span role="columnheader" className="fm-col-type">Type</span>
        <span role="columnheader" className="fm-col-size">Size</span>
        <span role="columnheader" className="fm-col-date">Modified</span>
        <span role="columnheader" className="fm-col-actions" />
      </div>

      {folders.map((folder) => {
        const isSel = selectedFolders.has(folder.id);
        return (
          <div
            key={folder.id}
            role="row"
            className={`fm-table-row ${isSel ? "selected" : ""}`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) onToggleFolder(folder.id, true);
              else onOpenFolder(folder);
            }}
            onDoubleClick={() => onOpenFolder(folder)}
            onContextMenu={(e) => onContext(e, { type: "folder", id: folder.id, name: folder.name })}
          >
            <span role="cell" className="fm-col-check">
              <button
                type="button"
                className={`fm-select-check small ${isSel ? "checked" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFolder(folder.id, true);
                }}
                aria-label={isSel ? "Deselect" : "Select"}
              >
                {isSel ? "✓" : ""}
              </button>
            </span>

            <span role="cell" className="fm-col-name">
              <span className="fm-list-icon folder">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span className="fm-list-name-text" title={folder.name}>
                {folder.name}
              </span>
              <span className="mini-badge">folder</span>
            </span>

            <span role="cell" className="fm-col-type muted">Folder</span>
            <span role="cell" className="fm-col-size muted">
              {folder.itemCount ?? 0} {folder.itemCount === 1 ? "item" : "items"}
            </span>
            <span role="cell" className="fm-col-date muted">{formatDate(folder.createdAt)}</span>

            <span role="cell" className="fm-col-actions">
              <button
                type="button"
                className="fm-row-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  onTriggerMenu({ x: rect.left, y: rect.bottom + 4 }, { type: "folder", id: folder.id, name: folder.name });
                }}
                aria-label="Options"
              >
                •••
              </button>
            </span>
          </div>
        );
      })}

      {files.map((file) => {
        const isSel = selectedFiles.has(file.id);
        const kind = fileKind(file.mimeType, file.name);
        const meta = getFileKindMeta(file.mimeType, file.name);
        const isPreviewable = kind === "image" || kind === "video" || kind === "audio";

        return (
          <div
            key={file.id}
            role="row"
            className={`fm-table-row ${isSel ? "selected" : ""}`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) onToggleFile(file.id, true);
              else if (isPreviewable) onOpenFile(file);
              else onToggleFile(file.id, false);
            }}
            onDoubleClick={() => (isPreviewable ? onOpenFile(file) : onDownload(file))}
            onContextMenu={(e) =>
              onContext(e, { type: "file", id: file.id, name: file.name, mimeType: file.mimeType, size: file.size })
            }
          >
            <span role="cell" className="fm-col-check">
              <button
                type="button"
                className={`fm-select-check small ${isSel ? "checked" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFile(file.id, true);
                }}
                aria-label={isSel ? "Deselect" : "Select"}
              >
                {isSel ? "✓" : ""}
              </button>
            </span>

            <span role="cell" className="fm-col-name">
              <span className="fm-list-icon" style={{ color: meta.accent, backgroundColor: meta.bg }}>
                {meta.label || "FILE"}
              </span>
              <span className="fm-list-name-text" title={file.name}>
                {file.name}
              </span>
              {file.chunked && <span className="mini-badge">chunked</span>}
            </span>

            <span role="cell" className="fm-col-type muted">{meta.label || kind.toUpperCase()}</span>
            <span role="cell" className="fm-col-size muted">{formatBytes(file.size)}</span>
            <span role="cell" className="fm-col-date muted">{formatDate(file.createdAt)}</span>

            <span role="cell" className="fm-col-actions">
              <button
                type="button"
                className="fm-row-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  void onDownload(file);
                }}
                aria-label="Download"
                title="Download"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              <button
                type="button"
                className="fm-row-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  onTriggerMenu(
                    { x: rect.left, y: rect.bottom + 4 },
                    { type: "file", id: file.id, name: file.name, mimeType: file.mimeType, size: file.size }
                  );
                }}
                aria-label="Options"
              >
                •••
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SelectionBar({
  count,
  onDownload,
  onMove,
  onDelete,
  onClear,
}: {
  count: number;
  onDownload: () => void;
  onMove: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      className="selection-bar fm-selection-bar"
    >
      <div className="fm-sel-count">
        <span>{count} selected</span>
      </div>
      <div className="selection-actions">
        <button type="button" onClick={onDownload} className="fm-sel-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Download</span>
        </button>
        <button type="button" onClick={onMove} className="fm-sel-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 3h5v5" />
            <path d="M8 21H3v-5" />
            <path d="M21 3l-7 7" />
            <path d="M3 21l7-7" />
          </svg>
          <span>Move</span>
        </button>
        <button type="button" onClick={onDelete} className="fm-sel-btn danger">
          <span>Delete</span>
        </button>
        <button type="button" onClick={onClear} className="fm-sel-btn ghost">
          <span>Clear</span>
        </button>
      </div>
    </motion.div>
  );
}

function UploadQueue({ items, onDismiss }: { items: UploadItem[]; onDismiss: () => void }) {
  const activeCount = items.filter((x) => x.status === "uploading" || x.status === "queued").length;

  return (
    <div className="upload-queue fm-upload-queue">
      <div className="queue-head">
        <div className="queue-head-left">
          <span className="queue-spinner" />
          <span>{activeCount > 0 ? `Uploading (${activeCount} left)` : "Uploads complete"}</span>
        </div>
        <button onClick={onDismiss} aria-label="Dismiss upload queue">
          ×
        </button>
      </div>
      <div className="queue-list">
        {items.map((item) => (
          <div key={item.id} className="queue-item">
            <div className="queue-item-main">
              <span className="queue-name" title={item.name}>
                {item.name}
              </span>
              <span className={`queue-status ${item.status}`}>
                {item.status === "uploading" ? `${item.progress}%` : item.status}
              </span>
            </div>
            {(item.status === "uploading" || item.status === "queued") && (
              <div className="queue-bar">
                <div className="queue-progress" style={{ width: `${item.progress}%` }} />
              </div>
            )}
            {item.status === "error" && item.error && <div className="queue-error">{item.error}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
