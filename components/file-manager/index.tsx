"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ClientFile, ClientFolder } from "./helpers";
import { fileKind, formatBytes, formatDate } from "./helpers";
import { FileManagerContextMenu, type MenuTarget } from "./context-menu";
import { NewFolderDialog, RenameDialog, MoveDialog, DeleteDialog, PreviewDialog, type DialogState } from "./dialogs";
import { useUploader, type UploadItem } from "./use-uploader";

type ViewMode = "grid" | "list";
type SortKey = "name" | "size" | "date";
type SortOrder = "asc" | "desc";

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

  // ── View state ──
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    const saved = window.localStorage.getItem("tellybase:fm-view");
    return saved === "grid" || saved === "list" ? saved : "grid";
  });
  const [sortBy, setSortBy] = useState<SortKey>(() => {
    if (typeof window === "undefined") return "name";
    const saved = window.localStorage.getItem("tellybase:fm-sort");
    if (saved) {
      const by = saved.split("-")[0] as SortKey;
      if (["name", "size", "date"].includes(by)) return by;
    }
    return "name";
  });
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    if (typeof window === "undefined") return "asc";
    const saved = window.localStorage.getItem("tellybase:fm-sort");
    const order = saved?.split("-")[1] as SortOrder | undefined;
    return order === "asc" || order === "desc" ? order : "asc";
  });
  const [search, setSearch] = useState("");

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
    localStorage.setItem("tellybase:fm-view", view);
  }, [view]);
  useEffect(() => {
    localStorage.setItem("tellybase:fm-sort", `${sortBy}-${sortOrder}`);
  }, [sortBy, sortOrder]);

  // ── Load folder contents ──
  const loadFolder = useCallback(async (folderId: string | null) => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      // NB: /api/folders understands parentId|root|all (NOT folderId) while
      // /api/files understands folderId|root — build the scopes separately or
      // opening a folder silently re-lists the root folders.
      const folderScope = folderId ? `parentId=${encodeURIComponent(folderId)}` : "root=1";
      const fileScope = folderId ? `folderId=${encodeURIComponent(folderId)}` : "root=1";
      const [folderRes, fileRes, pathRes] = await Promise.all([
        api(`/api/folders?${folderScope}`),
        api(`/api/files?${fileScope}&limit=500&sortBy=name&sortOrder=asc`),
        folderId ? api(`/api/folders/${encodeURIComponent(folderId)}`) : Promise.resolve(null),
      ]);
      if (reqId !== reqIdRef.current) return;
      if (!folderRes.ok) throw apiError(folderRes, "Failed to load folders");
      if (!fileRes.ok) throw apiError(fileRes, "Failed to load files");
      setFolders(folderRes.data?.folders ?? []);
      setFiles(fileRes.data?.files ?? []);
      if (pathRes && pathRes.ok) setPath(pathRes.data?.path ?? []);
      else setPath([]);
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

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 4000);
  }, []);

  // ── Sorting / filtering (client-side, folders first) ──
  const visibleFiles = useMemo(() => {
    let out = files.slice();
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
  }, [files, search, sortBy, sortOrder]);

  const visibleFolders = useMemo(() => {
    let out = folders.slice();
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((f) => f.name.toLowerCase().includes(q));
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [folders, search]);

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
      await loadFolder(cwd);
    },
    [cwd, loadFolder]
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
      await loadFolder(cwd);
    },
    [cwd, loadFolder]
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
    if (kind === "image" || kind === "video") setDialog({ type: "preview", file });
    else void downloadFile(file);
  }, [downloadFile]);

  return (
    <div ref={dropRef} className="fm-root" onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={(e) => { if (e.target === dropRef.current) setDragOver(false); }} onDrop={onDropUpload}>
      {/* Topbar */}
      <div className="gallery-topbar fm-topbar">
        <div className="gallery-topbar-left">
          <div className="gallery-page-title fm-title">
            <h1>Files</h1>
            <span>Folders, documents &amp; everything else</span>
          </div>
          <nav className="breadcrumbs fm-breadcrumbs" aria-label="Breadcrumb">
            <ol>
              <li>
                <button type="button" className={cwd === null ? "crumb-current" : ""} onClick={() => goToPath(-1)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  My Files
                </button>
              </li>
              {path.map((folder, i) => (
                <li key={folder.id} className="crumb-item">
                  <span aria-hidden="true" className="sep">/</span>
                  <button type="button" className={i === path.length - 1 ? "crumb-current" : ""} onClick={() => goToPath(i)}>
                    {folder.name}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>
        <div className="gallery-topbar-right">
          <button className="btn-upload btn-secondary" onClick={() => setDialog({ type: "new-folder" })} aria-label="New folder">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <path d="M12 11v6" />
              <path d="M9 14h6" />
            </svg>
            New folder
          </button>
          <button className="btn-upload" onClick={() => fileInputRef.current?.click()} aria-label="Upload files">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload here
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

      {/* Toolbar */}
      <div className="gallery-toolbar">
        <div className="toolbar-left">
          <div className="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              placeholder="Filter this folder…"
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
          <span className="count-pill">
            {visibleFolders.length + visibleFiles.length} {visibleFolders.length + visibleFiles.length === 1 ? "item" : "items"}
            {cwd !== null && ` in ${path.length ? path[path.length - 1].name : "folder"}`}
          </span>
          {files.length >= 500 && (
            <span className="fm-limit-hint" title="Refine with the filter above or organize into subfolders">
              500+ items — refine with search
            </span>
          )}
        </div>
        <div className="toolbar-right">
          <div className="sort-control">
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [by, order] = e.target.value.split("-") as [SortKey, SortOrder];
                setSortBy(by);
                setSortOrder(order);
              }}
              aria-label="Sort"
            >
              <option value="name-asc">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="size-desc">Largest first</option>
              <option value="size-asc">Smallest first</option>
            </select>
          </div>
          <div className="view-toggle" role="group" aria-label="View">
            <button
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={view === "grid" ? "active" : ""}
              onClick={() => setView("grid")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            <button
              aria-label="List view"
              aria-pressed={view === "list"}
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
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

      {/* Selection bar */}
      <AnimatePresence>
        {totalSelected > 0 && (
          <SelectionBar
            count={totalSelected}
            onMove={() => setDialog({ type: "move", targets: menuTargets })}
            onDelete={() => setDialog({ type: "delete", targets: menuTargets })}
            onClear={clearSelection}
          />
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="fm-main">
        {!loading && visibleFolders.length === 0 && visibleFiles.length === 0 ? (
          <div className="empty-state fm-empty">
            <div className="empty-illustration">
              <div className="empty-stack">
                <span />
                <span />
                <span />
              </div>
              <div className="empty-icon">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
            </div>
            <h3>{cwd === null ? "Your files area is empty" : "This folder is empty"}</h3>
            <p>
              {cwd === null
                ? "Create folders to organize your files, or upload documents, archives, audio and more."
                : "Create a subfolder or upload files directly into this folder."}
            </p>
            <div className="fm-empty-actions">
              <button className="btn-primary" onClick={() => setDialog({ type: "new-folder" })}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  <path d="M12 11v6" /><path d="M9 14h6" />
                </svg>
                New folder
              </button>
              <button className="btn-primary btn-secondary-solid" onClick={() => fileInputRef.current?.click()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload files
              </button>
            </div>
          </div>
        ) : view === "grid" ? (
          <div className="fm-grid">
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
                  setContext({ x: e.clientX, y: e.clientY, target: { type: "folder", id: folder.id, name: folder.name } });
                }}
              />
            ))}
            {visibleFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                selected={selectedFiles.has(file.id)}
                onSelect={(multi) => toggleFile(file.id, multi)}
                onOpen={() => openFile(file)}
                onContext={(e) => {
                  e.preventDefault();
                  if (!selectedFiles.has(file.id)) {
                    clearSelection();
                    toggleFile(file.id, false);
                  }
                  setContext({ x: e.clientX, y: e.clientY, target: { type: "file", id: file.id, name: file.name, mimeType: file.mimeType, size: file.size } });
                }}
              />
            ))}
          </div>
        ) : (
          <FileList
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
          />
        )}

        {loading && (
          <div className="gallery-loading">
            <span className="spinner" /> Loading…
          </div>
        )}
      </div>

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
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <h3>Drop to upload here</h3>
              <p>Files land in “{path.length ? path[path.length - 1].name : "My Files"}”</p>
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
              if (f) setDialog({ type: "preview", file: f });
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
          parentName={path.length ? path[path.length - 1].name : "My Files"}
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
                `${dialog.targets.length} ${dialog.targets.length === 1 ? "item" : "items"} moved${destinationId ? " to “" + (await folderName(destinationId)) + "”" : " to My Files"}`
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
        <PreviewDialog file={dialog.file} onClose={() => setDialog(null)} onDownload={() => void downloadFile(dialog.file)} />
      )}

      {/* Notice toast */}
      <AnimatePresence>
        {notice && (
          <motion.div className="fm-notice" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  async function folderName(id: string | null): Promise<string> {
    if (!id) return "My Files";
    const res = await api(`/api/folders/${encodeURIComponent(id)}`);
    return res.ok ? res.data?.folder?.name ?? "folder" : "folder";
  }
}

// ── Sub-components ──

function FolderCard({ folder, selected, onOpen, onSelect, onContext }: {
  folder: ClientFolder;
  selected: boolean;
  onOpen: () => void;
  onSelect: (multi?: boolean) => void;
  onContext: (e: React.MouseEvent) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`fm-folder-card ${selected ? "selected" : ""}`}
      // Single click opens the folder (Finder/Explorer behaviour);
      // Ctrl/Cmd/Shift+click toggles selection instead.
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) onSelect(true);
        else onOpen();
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
      <div className="fm-folder-icon">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div className="fm-card-meta">
        <span className="fm-card-name" title={folder.name}>{folder.name}</span>
        <span className="fm-card-sub">
          {folder.itemCount ?? 0} {folder.itemCount === 1 ? "item" : "items"}
        </span>
      </div>
      {selected && (
        <span className="fm-card-check" aria-hidden>
          ✓
        </span>
      )}
    </motion.div>
  );
}

function FileIcon({ kind }: { kind: ReturnType<typeof fileKind> }) {
  const color = {
    image: "#7cc4f7",
    video: "#c792ea",
    audio: "#f0b45e",
    archive: "#f28b82",
    document: "#8fb8a8",
    other: "#969aa1",
  }[kind];
  return (
    <span className="fm-file-icon" style={{ color, "--fm-icon-color": color } as React.CSSProperties}>
      {kind === "image" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      ) : kind === "video" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="2" y="4" width="14" height="16" rx="2" />
          <path d="M16 10l6-3v10l-6-3" />
        </svg>
      ) : kind === "audio" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      ) : kind === "archive" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M21 8v13H3V8" />
          <path d="M1 3h22v5H1z" />
          <path d="M10 12h4" />
        </svg>
      ) : kind === "document" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      )}
    </span>
  );
}

function FileCard({ file, selected, onSelect, onOpen, onContext }: {
  file: ClientFile;
  selected: boolean;
  onSelect: (multi?: boolean) => void;
  onOpen: () => void;
  onContext: (e: React.MouseEvent) => void;
}) {
  const kind = fileKind(file.mimeType, file.name);
  const canPreview = kind === "image" || kind === "video";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`fm-file-card ${selected ? "selected" : ""}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) onSelect(true);
        else if (canPreview) onOpen();
        else onSelect(false);
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
      <div className="fm-file-thumb">
        {canPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/files/${file.id}?thumbnail=1`} alt="" loading="lazy" decoding="async" />
        ) : (
          <FileIcon kind={kind} />
        )}
        {kind === "video" && <span className="fm-video-badge">▶</span>}
      </div>
      <div className="fm-card-meta">
        <span className="fm-card-name" title={file.name}>{file.name}</span>
        <span className="fm-card-sub">
          {formatBytes(file.size)}
          {file.chunked ? " · chunked" : ""}
        </span>
      </div>
      {selected && <span className="fm-card-check" aria-hidden>✓</span>}
    </motion.div>
  );
}

function FileList({ folders, files, selectedFolders, selectedFiles, onOpenFolder, onOpenFile, onToggleFolder, onToggleFile, onDownload, onContext }: {
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
}) {
  return (
    <div className="list-wrap fm-list" role="table" aria-label="Files">
      <div className="list-head" role="row">
        <span role="columnheader" style={{ width: 36 }} />
        <span role="columnheader">Name</span>
        <span role="columnheader">Size</span>
        <span role="columnheader">Type</span>
        <span role="columnheader">Modified</span>
        <span role="columnheader" style={{ width: 40 }} />
      </div>
      {folders.map((folder) => {
        const isSel = selectedFolders.has(folder.id);
        return (
          <div
            key={folder.id}
            role="row"
            className={`list-row ${isSel ? "selected" : ""}`}
            // Single click opens the folder; Ctrl/Cmd/Shift+click selects.
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) onToggleFolder(folder.id, true);
              else onOpenFolder(folder);
            }}
            onDoubleClick={() => onOpenFolder(folder)}
            onContextMenu={(e) => onContext(e, { type: "folder", id: folder.id, name: folder.name })}
          >
            <span role="cell">
              <button
                className={`check small ${isSel ? "checked" : ""}`}
                onClick={(e) => { e.stopPropagation(); onToggleFolder(folder.id, true); }}
                aria-label={isSel ? "Deselect" : "Select"}
              >
                {isSel ? "✓" : ""}
              </button>
            </span>
            <span role="cell" className="list-name">
              <span className="file-icon fm-list-folder-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span title={folder.name}>{folder.name}</span>
              <span className="mini-badge">folder</span>
            </span>
            <span role="cell" className="muted">—</span>
            <span role="cell" className="muted">Folder</span>
            <span role="cell" className="muted">{formatDate(folder.createdAt)}</span>
            <span role="cell" className="row-actions">
              <button onClick={(e) => { e.stopPropagation(); onOpenFolder(folder); }} aria-label="Open folder">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
                </svg>
              </button>
            </span>
          </div>
        );
      })}
      {files.map((file) => {
        const isSel = selectedFiles.has(file.id);
        const kind = fileKind(file.mimeType, file.name);
        const canPreview = kind === "image" || kind === "video";
        return (
          <div
            key={file.id}
            role="row"
            className={`list-row ${isSel ? "selected" : ""} ${canPreview ? "previewable" : ""}`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) onToggleFile(file.id, true);
              else if (canPreview) onOpenFile(file);
              else onToggleFile(file.id, false);
            }}
            onDoubleClick={() => (canPreview ? onOpenFile(file) : onDownload(file))}
            onContextMenu={(e) => onContext(e, { type: "file", id: file.id, name: file.name, mimeType: file.mimeType, size: file.size })}
          >
            <span role="cell">
              <button
                className={`check small ${isSel ? "checked" : ""}`}
                onClick={(e) => { e.stopPropagation(); onToggleFile(file.id, true); }}
                aria-label={isSel ? "Deselect" : "Select"}
              >
                {isSel ? "✓" : ""}
              </button>
            </span>
            <span role="cell" className="list-name">
              <span className="file-icon">
                <FileIcon kind={kind} />
              </span>
              <span title={file.name}>{file.name}</span>
              {file.chunked && <span className="mini-badge">chunked</span>}
            </span>
            <span role="cell" className="muted">{formatBytes(file.size)}</span>
            <span role="cell" className="muted">{kind.toUpperCase()}</span>
            <span role="cell" className="muted">{formatDate(file.createdAt)}</span>
            <span role="cell" className="row-actions">
              <button onClick={(e) => { e.stopPropagation(); onDownload(file); }} aria-label="Download">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SelectionBar({ count, onMove, onDelete, onClear }: {
  count: number;
  onMove: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 16, opacity: 0 }}
      className="selection-bar"
    >
      <span>{count} selected</span>
      <div className="selection-actions">
        <button onClick={onMove}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: -2 }}>
            <path d="M16 3h5v5" /><path d="M8 21H3v-5" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
          </svg>
          Move to…
        </button>
        <button onClick={onDelete} className="danger">Delete</button>
        <button onClick={onClear} className="ghost">Clear</button>
      </div>
    </motion.div>
  );
}

function UploadQueue({ items, onDismiss }: { items: UploadItem[]; onDismiss: () => void }) {
  return (
    <div className="upload-queue">
      <div className="queue-head">
        <span>Uploading to Files</span>
        <button onClick={onDismiss} aria-label="Dismiss">×</button>
      </div>
      <div className="queue-list">
        {items.map((item) => (
          <div key={item.id} className="queue-item">
            <div className="queue-item-main">
              <span className="queue-name" title={item.name}>{item.name}</span>
              <span className={`queue-status ${item.status}`}>{item.status}</span>
            </div>
            {item.status === "uploading" || item.status === "queued" ? (
              <div className="queue-bar">
                <div className="queue-progress" style={{ width: `${item.progress}%` }} />
              </div>
            ) : null}
            {item.status === "error" && item.error ? <div className="queue-error">{item.error}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
