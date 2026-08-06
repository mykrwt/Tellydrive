"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ClientFile, ClientFolder } from "./helpers";
import { fileKind, formatBytes } from "./helpers";
import type { MenuTarget } from "./context-menu";

export type DialogState =
  | { type: "new-folder" }
  | { type: "rename"; target: MenuTarget }
  | { type: "move"; targets: MenuTarget[] }
  | { type: "delete"; targets: MenuTarget[] }
  | { type: "preview"; file: ClientFile }
  | null;

function useModal(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return ref;
}

function ModalShell({ title, subtitle, onClose, children, wide }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useModal(onClose);
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={ref}
        className={`modal-card ${wide ? "modal-card-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.985 }}
        transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
      >
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

// ── New folder ──
export function NewFolderDialog({ parentName, onClose, onSubmit }: {
  parentName: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <ModalShell title="New folder" subtitle={`Will be created inside “${parentName}”`} onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || busy) return;
          setBusy(true);
          try {
            await onSubmit(name.trim());
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          ref={inputRef}
          className="modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Folder name"
          maxLength={100}
          aria-label="Folder name"
        />
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!name.trim() || busy}>
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Rename ──
export function RenameDialog({ target, onClose, onSubmit }: {
  target: MenuTarget;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(target.name);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    // Select the stem, not the extension, when renaming a file
    const dot = target.type === "file" ? target.name.lastIndexOf(".") : -1;
    if (dot > 0) inputRef.current?.setSelectionRange(0, dot);
    else inputRef.current?.select();
  }, [target]);

  return (
    <ModalShell title={`Rename ${target.type === "folder" ? "folder" : "file"}`} subtitle={target.name} onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || busy) return;
          setBusy(true);
          try {
            await onSubmit(name.trim());
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          ref={inputRef}
          className="modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={255}
          aria-label="New name"
        />
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!name.trim() || busy}>
            {busy ? "Renaming…" : "Rename"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Move ──
type TreeFolder = ClientFolder & { children: TreeFolder[] };

function buildTree(all: ClientFolder[]): TreeFolder[] {
  const nodes = new Map<string, TreeFolder>();
  for (const f of all) nodes.set(f.id, { ...f, children: [] });
  const roots: TreeFolder[] = [];
  for (const f of all) {
    const node = nodes.get(f.id)!;
    if (f.parentId && nodes.has(f.parentId)) nodes.get(f.parentId)!.children.push(node);
    else roots.push(node);
  }
  const sortRec = (list: TreeFolder[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function collectDescendants(tree: TreeFolder[], id: string): Set<string> {
  const out = new Set<string>();
  const find = (list: TreeFolder[]): TreeFolder | null => {
    for (const n of list) {
      if (n.id === id) return n;
      const found = find(n.children);
      if (found) return found;
    }
    return null;
  };
  const walk = (n: TreeFolder) => {
    out.add(n.id);
    n.children.forEach(walk);
  };
  const node = find(tree);
  if (node) walk(node);
  return out;
}

export function MoveDialog({ targets, currentFolderId, onClose, onSubmit }: {
  targets: MenuTarget[];
  currentFolderId: string | null;
  onClose: () => void;
  onSubmit: (destinationId: string | null) => Promise<void>;
}) {
  const [all, setAll] = useState<ClientFolder[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [destination, setDestination] = useState<string | null>(currentFolderId);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/folders?all=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { folders?: ClientFolder[] }) => {
        if (cancelled) return;
        const list = data.folders ?? [];
        setAll(list);
        // Expand the top level by default so the tree is immediately navigable
        setExpanded(new Set(list.map((n) => n.id)));
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load folders");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tree = useMemo(() => buildTree(all), [all]);
  const disabledIds = useMemo(() => {
    const out = new Set<string>();
    for (const t of targets) {
      if (t.type === "folder") {
        out.add(t.id);
        collectDescendants(tree, t.id).forEach((id) => out.add(id));
      }
    }
    return out;
  }, [targets, tree]);

  const select = useCallback((id: string | null) => {
    setDestination(id);
  }, []);
  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const renderNode = (node: TreeFolder, depth: number): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const disabled = disabledIds.has(node.id);
    const isOpen = expanded.has(node.id);
    const isDest = destination === node.id;
    return (
      <div key={node.id}>
        <div
          className={`fm-tree-row ${isDest ? "dest" : ""} ${disabled ? "disabled" : ""}`}
          style={{ paddingLeft: 14 + depth * 18 }}
        >
          <button
            type="button"
            className="fm-tree-toggle"
            onClick={() => hasChildren && toggleExpand(node.id)}
            aria-label={isOpen ? "Collapse" : "Expand"}
            tabIndex={hasChildren ? 0 : -1}
          >
            {hasChildren ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            ) : (
              <span className="fm-tree-dot" />
            )}
          </button>
          <button
            type="button"
            className="fm-tree-label"
            disabled={disabled}
            onClick={() => select(node.id)}
            title={node.name}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span>{node.name}</span>
            {disabled && <span className="mini-badge">current</span>}
          </button>
        </div>
        {isOpen && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  const label = targets.length === 1 ? (targets[0].type === "folder" ? "folder" : "file") : `${targets.length} items`;

  return (
    <ModalShell title={`Move ${label}`} subtitle="Choose a destination folder" onClose={onClose} wide>
      <div className="modal-body">
        <div className="fm-tree">
          <div className={`fm-tree-row ${destination === null ? "dest" : ""}`} style={{ paddingLeft: 14 }}>
            <span className="fm-tree-toggle" />
            <button type="button" className="fm-tree-label" onClick={() => select(null)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
              <span>My Files (root)</span>
            </button>
          </div>
          {tree.map((n) => renderNode(n, 0))}
        </div>
        {loadError && <div className="queue-error">{loadError}</div>}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSubmit(destination);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Moving…" : `Move here`}
        </button>
      </div>
    </ModalShell>
  );
}

// ── Delete ──
export function DeleteDialog({ targets, onClose, onSubmit }: {
  targets: MenuTarget[];
  onClose: () => void;
  onSubmit: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const folders = targets.filter((t) => t.type === "folder").length;
  const files = targets.filter((t) => t.type === "file").length;
  const total = targets.length;

  return (
    <ModalShell title={`Delete ${total} ${total === 1 ? "item" : "items"}?`} subtitle="This cannot be undone" onClose={onClose}>
      <div className="modal-body">
        <p className="modal-copy">
          {folders > 0 && (
            <>
              <strong>{folders}</strong> {folders === 1 ? "folder" : "folders"}
              {files > 0 && " and "}
            </>
          )}
          {files > 0 && (
            <>
              <strong>{files}</strong> {files === 1 ? "file" : "files"}
            </>
          )}{" "}
          will be permanently deleted.
        </p>
        {folders > 0 && (
          <p className="modal-copy muted">
            Files inside deleted folders are not destroyed — they move up to the parent folder.
          </p>
        )}
        <ul className="modal-name-list">
          {targets.slice(0, 8).map((t) => (
            <li key={`${t.type}-${t.id}`} title={t.name}>{t.name}</li>
          ))}
          {total > 8 && <li className="muted">…and {total - 8} more</li>}
        </ul>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="btn-danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSubmit();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </ModalShell>
  );
}

// ── Preview ──
export function PreviewDialog({ file, onClose, onDownload }: {
  file: ClientFile;
  onClose: () => void;
  onDownload: () => void;
}) {
  const kind = fileKind(file.mimeType, file.name);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const src = `/api/files/${file.id}?download=1&proxy=1&inline=1`;

  const canShow = kind === "image" || kind === "video";

  return (
    <ModalShell title={file.name} subtitle={`${file.mimeType} • ${formatBytes(file.size)} • ${new Date(file.createdAt).toLocaleString()}`} onClose={onClose} wide>
      <div className="modal-body preview-body">
        {canShow ? (
          <>
            {!loaded && !error && (
              <div className="lightbox-loading">
                <span className="spinner light" />
              </div>
            )}
            {kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={file.name}
                className="preview-media"
                style={{ opacity: loaded ? 1 : 0 }}
                onLoad={() => setLoaded(true)}
                onError={() => { setError("Failed to load preview"); setLoaded(true); }}
              />
            ) : (
              <video
                src={src}
                controls
                autoPlay
                playsInline
                preload="metadata"
                className="preview-media"
                style={{ opacity: loaded ? 1 : 0 }}
                onLoadedData={() => setLoaded(true)}
                onError={() => setError("Failed to load preview")}
              />
            )}
            {error && <div className="queue-error">{error}</div>}
          </>
        ) : (
          <div className="preview-fallback">
            <div className="fallback-icon">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <p>No preview available for this file type.</p>
          </div>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
        <button type="button" className="btn-primary" onClick={onDownload}>Download</button>
      </div>
    </ModalShell>
  );
}
