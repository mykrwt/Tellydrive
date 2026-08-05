"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import { formatBytes, formatDate } from "@/lib/format";

interface TrashedFile {
  id: number;
  name: string;
  size_bytes: number;
  is_image: number;
  is_video: number;
  deleted_at: string | null;
}

interface TrashedFolder {
  id: number;
  name: string;
  deleted_at: string | null;
}

export function TrashManager({
  initialFiles,
  initialFolders,
}: {
  initialFiles: TrashedFile[];
  initialFolders: TrashedFolder[];
}) {
  const [files, setFiles] = useState(initialFiles);
  const [folders, setFolders] = useState(initialFolders);

  const reload = async () => {
    const data = await api<{ files: TrashedFile[]; folders: TrashedFolder[] }>("/api/trash");
    setFiles(data.files);
    setFolders(data.folders);
  };

  const restoreFile = async (id: number) => {
    await api(`/api/files/${id}/restore`, { method: "POST" });
    reload();
  };
  const purgeFile = async (id: number) => {
    if (!confirm("Permanently delete this file? This cannot be undone.")) return;
    await api(`/api/files/${id}/permanent`, { method: "DELETE" });
    reload();
  };
  const restoreFolder = async (id: number) => {
    await api(`/api/folders/${id}/restore`, { method: "POST" });
    reload();
  };
  const purgeFolder = async (id: number) => {
    if (!confirm("Permanently delete this folder and its files?")) return;
    await api(`/api/folders/${id}/permanent`, { method: "DELETE" });
    reload();
  };
  const emptyAll = async () => {
    if (!confirm("Permanently delete everything in the Recycle Bin?")) return;
    await api("/api/trash", { method: "DELETE" });
    reload();
  };

  const nothing = files.length === 0 && folders.length === 0;

  return (
    <div className="card">
      <div className="trash-toolbar">
        <span className="hint">Items are kept for {30} days, then deleted automatically.</span>
        <button className="button button-quiet danger" onClick={emptyAll} disabled={nothing}>
          Empty Recycle Bin
        </button>
      </div>

      {nothing ? (
        <div className="empty-state small"><p>Your Recycle Bin is empty.</p></div>
      ) : (
        <div className="trash-list">
          {folders.map((f) => (
            <div key={f.id} className="trash-row">
              <span className="trash-icon">⌁</span>
              <div>
                <b>{f.name}</b>
                <small>Folder · deleted {formatDate(f.deleted_at ?? "")}</small>
              </div>
              <div className="trash-actions">
                <button className="button button-quiet" onClick={() => restoreFolder(f.id)}>Restore</button>
                <button className="button button-quiet danger" onClick={() => purgeFolder(f.id)}>Delete</button>
              </div>
            </div>
          ))}
          {files.map((f) => (
            <div key={f.id} className="trash-row">
              <span className="trash-icon">{f.is_image ? "▱" : "▶"}</span>
              <div>
                <b>{f.name}</b>
                <small>{formatBytes(f.size_bytes)} · deleted {formatDate(f.deleted_at ?? "")}</small>
              </div>
              <div className="trash-actions">
                <button className="button button-quiet" onClick={() => restoreFile(f.id)}>Restore</button>
                <button className="button button-quiet danger" onClick={() => purgeFile(f.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
