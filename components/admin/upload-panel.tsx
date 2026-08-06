"use client";

import { useCallback, useRef, useState } from "react";
import { FileUp, Trash2 } from "lucide-react";
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

  const removeFile = useCallback(async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        window.alert(data?.error || "Delete failed");
      } else {
        setRecent((prev) => prev.filter((file) => file.id !== id));
      }
    } finally {
      setDeleting(null);
    }
  }, []);

  return (
    <section className="tb-panel tb-admin-panel">
      <div className="tb-panel-head">
        <div>
          <span className="tb-panel-label">Uploads</span>
          <h2>Admin uploads</h2>
          <p>Drop files here to seed the workspace, test storage, or move assets into the admin account.</p>
        </div>
        {isAdminAccount ? <span className="tb-inline-pill">Admin account</span> : null}
      </div>

      <div
        className={`tb-upload-dropzone ${dragOver ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload files"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
      >
        <span className="tb-upload-dropzone-icon"><FileUp size={20} /></span>
        <strong>Drop files or click to upload</strong>
        <span>Any safe file type is accepted. Files are stored in the admin root library.</span>
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

      {queue.length > 0 ? (
        <div className="upload-queue ad-queue tb-upload-queue-inline">
          <div className="queue-head">
            <span>{queue.some((item) => item.status === "uploading") ? "Uploading files" : "Upload queue"}</span>
            <button onClick={dismissDone} aria-label="Dismiss">×</button>
          </div>
          <div className="queue-list">
            {queue.map((item) => (
              <div key={item.id} className="queue-item">
                <div className="queue-item-main">
                  <span className="queue-name" title={item.name}>{item.name}</span>
                  <span className={`queue-status ${item.status}`}>{item.status === "uploading" ? `${item.progress}%` : item.status}</span>
                </div>
                {(item.status === "uploading" || item.status === "queued") ? (
                  <div className="queue-bar">
                    <div className="queue-progress" style={{ width: `${item.progress}%` }} />
                  </div>
                ) : null}
                {item.status === "error" && item.error ? <div className="queue-error">{item.error}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="tb-admin-subsection-head">
        <h3>Recent uploads</h3>
        <span>{recent.length} items</span>
      </div>

      {recent.length === 0 ? (
        <p className="tb-empty-inline">No files uploaded yet.</p>
      ) : (
        <div className="tb-admin-recent-list">
          {recent.map((file) => {
            const kind = fileKind(file.mimeType, file.name);
            return (
              <div key={file.id} className="tb-admin-recent-item">
                <span className={`tb-result-icon ${kind === "image" || kind === "video" ? "media" : "file"}`}>
                  {kind === "image" ? "🖼" : kind === "video" ? "🎬" : kind === "audio" ? "♪" : kind === "archive" ? "🗜" : "📄"}
                </span>
                <div>
                  <strong title={file.name}>{file.name}</strong>
                  <span>{formatBytes(file.size)} · {formatDate(file.createdAt)}</span>
                </div>
                <button
                  className="tb-icon-button subtle danger"
                  onClick={() => void removeFile(file.id)}
                  disabled={deleting === file.id}
                  aria-label={`Delete ${file.name}`}
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
