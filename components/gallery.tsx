"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import { formatBytes, formatDate } from "@/lib/format";

interface FileType {
  id: number;
  name: string;
  mime: string | null;
  size_bytes: number;
  is_image: number;
  is_video: number;
  folder_id: number | null;
  created_at: string;
}

interface FolderOpt {
  id: number;
  name: string;
  path: string;
}

export function Gallery({
  initialFiles,
  folders,
  initialFolder,
}: {
  initialFiles: FileType[];
  folders: FolderOpt[];
  initialFolder: number | null;
}) {
  const [files, setFiles] = useState<FileType[]>(initialFiles);
  const [folder, setFolder] = useState<number | null>(initialFolder);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | "image" | "video">("all");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<FileType | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);

  const load = async (overrides?: any) => {
    setLoading(true);
    const q = overrides?.query ?? query;
    const t = overrides?.type ?? type;
    const s = overrides?.sort ?? sort;
    const f =
      overrides?.folder !== undefined ? overrides.folder : folder;
    const params = new URLSearchParams({ sort: s, type: t });
    if (f !== null) params.set("folder_id", String(f));
    if (q) params.set("q", q);
    try {
      const data = await api<{ files: FileType[] }>(`/api/files?${params}`);
      setFiles(data.files);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const doAction = async (
    file: FileType,
    action: "delete" | "rename" | "move",
  ) => {
    if (action === "delete") {
      if (!confirm(`Move "${file.name}" to the Recycle Bin?`)) return;
      await api(`/api/files/${file.id}`, { method: "DELETE" });
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } else if (action === "rename") {
      const name = prompt("Rename file", file.name);
      if (name && name !== file.name) {
        await api(`/api/files/${file.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name }),
        });
        load();
      }
    } else if (action === "move") {
      const fId = Number(prompt("Move to folder id (0 = root):", String(file.folder_id ?? 0)));
      if (Number.isFinite(fId)) {
        await api(`/api/files/${file.id}`, {
          method: "PATCH",
          body: JSON.stringify({ folder_id: fId === 0 ? null : fId }),
        });
        load();
      }
    }
    setMenuFor(null);
  };

  return (
    <div>
      <div className="gallery-toolbar card-toolbar">
        <input
          className="search-input"
          placeholder="Search files…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load({ query: query })}
        />
        <button className="button button-quiet" onClick={() => load({ query })}>Search</button>
        <select value={type} onChange={(e) => setType(e.target.value as any)} onBlur={(e) => load({ type: e.target.value })}>
          <option value="all">All types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} onBlur={(e) => load({ sort: e.target.value })}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name A–Z</option>
          <option value="size">Largest</option>
        </select>
        <select value={folder ?? ""} onChange={(e) => setFolder(e.target.value === "" ? null : Number(e.target.value))} onBlur={(e) => load({ folder: e.target.value === "" ? null : Number(e.target.value) })}>
          <option value="">All folders</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.path}</option>
          ))}
        </select>
      </div>

      {loading && <p className="hint">Loading…</p>}

      {files.length === 0 && !loading ? (
        <div className="empty-state">
          <span className="empty-icon">▱</span>
          <h3>No files here</h3>
          <p>Upload some images or videos to see them in your gallery.</p>
        </div>
      ) : (
        <div className="gallery-grid">
          {files.map((f) => (
            <article key={f.id} className="gallery-card">
              <div className="gallery-thumb" onClick={() => setView(f)}>
                {f.is_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${f.id}/content`} alt={f.name} loading="lazy" />
                ) : (
                  <span className="play">▶</span>
                )}
                <button
                  className="kebab"
                  aria-label="More"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuFor(menuFor === f.id ? null : f.id);
                  }}
                >
                  •••
                </button>
                {menuFor === f.id && (
                  <div className="menu">
                    <button onClick={() => doAction(f, "rename")}>Rename</button>
                    <button onClick={() => doAction(f, "move")}>Move</button>
                    <button className="danger" onClick={() => doAction(f, "delete")}>Delete</button>
                  </div>
                )}
              </div>
              <div className="gallery-meta">
                <b>{f.name}</b>
                <small>{f.is_video ? "Video" : "Image"} · {formatBytes(f.size_bytes)} · {formatDate(f.created_at)}</small>
              </div>
            </article>
          ))}
        </div>
      )}

      {view && (
        <div className="modal" onClick={() => setView(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setView(null)}>✕</button>
            <h3>{view.name}</h3>
            {view.is_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="modal-media" src={`/api/files/${view.id}/content`} alt={view.name} />
            ) : (
              <video className="modal-media" src={`/api/files/${view.id}/content`} controls autoPlay />
            )}
            <p className="hint">{formatBytes(view.size_bytes)} · {formatDate(view.created_at)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
