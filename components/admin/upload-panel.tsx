"use client";

import { useCallback, useRef, useState } from "react";
import type { ClientFile } from "@/components/file-manager/helpers";
import { fileKind, formatBytes, formatDate } from "@/components/file-manager/helpers";
import { useUploader } from "@/components/file-manager/use-uploader";

export function AdminUploadPanel({ initialRecent, isAdminAccount }: { initialRecent: ClientFile[]; isAdminAccount: boolean }) {
  const [recent, setRecent] = useState<ClientFile[]>(initialRecent);
  const [dragOver, setDragOver] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/files?limit=20&sortBy=date&sortOrder=desc", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setRecent(data.files ?? []);
    }
  }, []);

  const { queue, uploadFiles, dismissDone } = useUploader(refresh);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer?.files?.length) void uploadFiles(e.dataTransfer.files, null);
    },
    [uploadFiles]
  );

  const removeFile = useCallback(
    async (id: string) => {
      setDeleting(id);
      try {
        const res = await fetch(`/api/files/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          window.alert(data?.error || "Delete failed");
        } else {
          setRecent((prev) => prev.filter((f) => f.id !== id));
        }
      } finally {
        setDeleting(null);
      }
    },
    []
  );

  return (
    <section className="ad-card">
      <div className="ad-card-head">
        <div>
          <h3>Upload &amp; manage files</h3>
          <p>Upload files into the admin account’s storage. Any safe file type is accepted (documents, archives, audio, media).</p>
        </div>
        {isAdminAccount && <span className="dash-nav-admin-badge">ADMIN ACCOUNT</span>}
      </div>

      <div
        className={`ad-upload-zone ${dragOver ? "dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload files"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <strong>Drop files here or click to browse</strong>
        <span>Uploads land in “My Files” of the admin account · up to 2 GB per file</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files) void uploadFiles(e.target.files, null);
            e.target.value = "";
          }}
        />
      </div>

      {queue.length > 0 && (
        <div className="upload-queue ad-queue">
          <div className="queue-head">
            <span>Uploading…</span>
            <button onClick={dismissDone} aria-label="Dismiss">×</button>
          </div>
          <div className="queue-list">
            {queue.map((item) => (
              <div key={item.id} className="queue-item">
                <div className="queue-item-main">
                  <span className="queue-name" title={item.name}>{item.name}</span>
                  <span className={`queue-status ${item.status}`}>{item.status}</span>
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
      )}

      <div className="ad-recent">
        <div className="ad-subhead">
          <h4>Recent uploads</h4>
          <span>{recent.length} latest</span>
        </div>
        {recent.length === 0 ? (
          <p className="ad-empty">No files uploaded yet.</p>
        ) : (
          <ul className="ad-recent-list">
            {recent.map((f) => {
              const kind = fileKind(f.mimeType, f.name);
              return (
                <li key={f.id} className="ad-recent-item">
                  <span className={`ad-recent-kind kind-${kind}`}>
                    {kind === "image" ? "🖼" : kind === "video" ? "🎬" : kind === "audio" ? "♪" : kind === "archive" ? "🗜" : kind === "document" ? "📄" : "📎"}
                  </span>
                  <div className="ad-recent-meta">
                    <span className="ad-recent-name" title={f.name}>{f.name}</span>
                    <span className="ad-recent-sub">{formatBytes(f.size)} · {formatDate(f.createdAt)}</span>
                  </div>
                  <button
                    className="icon-button delete"
                    onClick={() => void removeFile(f.id)}
                    disabled={deleting === f.id}
                    aria-label={`Delete ${f.name}`}
                    title="Delete"
                  >
                    {deleting === f.id ? "…" : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
