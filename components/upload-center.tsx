"use client";

import { useCallback, useRef, useState } from "react";
import { formatBytes } from "@/lib/format";

type FolderOption = { id: number; name: string; path: string };

interface UploadItem {
  name: string;
  size: number;
  status: "queued" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

export function UploadCenter({
  folders,
  maxUploadBytes,
  quotaRemaining,
}: {
  folders: FolderOption[];
  maxUploadBytes: number;
  quotaRemaining: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [folderId, setFolderId] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const next = Array.from(fileList).map((f) => ({
        name: f.name,
        size: f.size,
        status: "queued" as const,
        progress: 0,
      }));
      setItems((prev) => [...prev, ...next]);
      if (next.length) {
        setPendingFiles((prev) => [...prev, ...Array.from(fileList)]);
      }
    },
    [],
  );

  const uploadAll = async () => {
    if (busy || pendingFiles.length === 0) return;
    setBusy(true);
    const files = pendingFiles;
    setPendingFiles([]);
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    if (folderId) fd.append("folder_id", folderId);

    setItems((prev) =>
      prev.map((it) =>
        files.some((f) => f.name === it.name && f.size === it.size)
          ? { ...it, status: "uploading" as const }
          : it,
      ),
    );

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        // Apply global progress to currently uploading items.
        setItems((prev) =>
          prev.map((it) =>
            it.status === "uploading" ? { ...it, progress: pct } : it,
          ),
        );
      }
    };
    xhr.onload = () => {
      let result: any = {};
      try {
        result = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && result.results) {
        setItems((prev) =>
          prev.map((it) => {
            const r = result.results.find(
              (x: any) => x.name === it.name && x.status === "ok",
            );
            if (r) return { ...it, status: "done" as const, progress: 100 };
            const er = result.results.find(
              (x: any) => x.name === it.name && x.status === "error",
            );
            if (er) return { ...it, status: "error" as const, error: er.error };
            return it;
          }),
        );
      } else {
        setItems((prev) =>
          prev.map((it) =>
            it.status === "uploading"
              ? { ...it, status: "error" as const, error: result.error ?? "Upload failed" }
              : it,
          ),
        );
      }
      setBusy(false);
    };
    xhr.onerror = () => {
      setItems((prev) =>
        prev.map((it) =>
          it.status === "uploading"
            ? { ...it, status: "error" as const, error: "Network error" }
            : it,
        ),
      );
      setBusy(false);
    };
    xhr.send(fd);
  };

  const clearDone = () => setItems((prev) => prev.filter((it) => it.status !== "done"));

  return (
    <div>
      <div
        className={`dropzone ${dragOver ? "dropzone-active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <span className="dz-icon">↥</span>
        <h3>Drop images & videos here</h3>
        <p>or click to browse — drag & drop works too</p>
        <button
          className="button button-light"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="upload-toolbar">
        <label>
          Upload to folder
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">Library root</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.path}</option>
            ))}
          </select>
        </label>
        <div className="upload-limits">
          Max per file {formatBytes(maxUploadBytes)} · {formatBytes(quotaRemaining)} remaining
        </div>
      </div>

      {items.length > 0 && (
        <div className="upload-list">
          {items.map((it, i) => (
            <div key={`${it.name}-${i}`} className="upload-row">
              <div className="upload-row-info">
                <b>{it.name}</b>
                <small>{formatBytes(it.size)}</small>
                {it.status === "error" && <em>{it.error}</em>}
              </div>
              <div className="upload-row-bar">
                {it.status === "done" && <span className="pill pill-ok">Uploaded ✓</span>}
                {it.status === "error" && <span className="pill pill-err">Failed</span>}
                {it.status === "uploading" && (
                  <div className="mini-progress"><i style={{ width: `${it.progress}%` }} /></div>
                )}
                {it.status === "queued" && <span className="pill">Queued</span>}
              </div>
            </div>
          ))}
          <div className="upload-actions">
            <button className="button button-primary" onClick={uploadAll} disabled={busy || pendingFiles.length === 0}>
              {busy ? "Uploading…" : `Upload ${pendingFiles.length} file${pendingFiles.length === 1 ? "" : "s"}`}
            </button>
            <button className="button button-quiet" onClick={clearDone}>Clear finished</button>
          </div>
        </div>
      )}
    </div>
  );
}
