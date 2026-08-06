"use client";

import { useState, useTransition } from "react";
import { uploadFileAction, deleteFileAction, getDownloadUrlAction } from "@/app/dashboard/storage-actions";
import type { StoredFile } from "@/lib/telegram-store";

function formatSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function StorageSection({ files }: { files: StoredFile[] }) {
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await uploadFileAction(formData);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDownload(telegramFileId: string, name: string) {
    try {
      const url = await getDownloadUrlAction(telegramFileId);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Download failed");
    }
  }

  async function handleDelete(fileId: string) {
    if (!confirm("Are you sure you want to delete this file?")) return;
    startTransition(async () => {
      try {
        await deleteFileAction(fileId);
      } catch (error) {
        alert(error instanceof Error ? error.message : "Delete failed");
      }
    });
  }

  return (
    <article className="profile-card storage-feature-card">
      <div className="card-label">
        <span>Cloud Storage</span>
        <span className="verified-pill">{files.length} {files.length === 1 ? 'file' : 'files'}</span>
      </div>
      
      <div className="upload-zone">
        <label className="primary-button upload-button">
          {uploading ? <span className="spinner" /> : "Upload file"}
          <input 
            type="file" 
            onChange={handleUpload} 
            disabled={uploading || isPending} 
            style={{ display: 'none' }}
          />
        </label>
        <p className="helper-copy">Files are stored securely in your Telegram chat.</p>
      </div>

      <div className="file-list">
        {files.length === 0 ? (
          <div className="empty-files">
            <p>No files uploaded yet.</p>
          </div>
        ) : (
          <ul className="file-items-list">
            {files.map((file) => (
              <li key={file.id} className="file-item">
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-meta">{formatSize(file.size)} • {new Date(file.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="file-actions">
                  <button 
                    onClick={() => handleDownload(file.telegramFileId, file.name)}
                    className="icon-button"
                    title="Download"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </button>
                  <button 
                    onClick={() => handleDelete(file.id)}
                    className="icon-button delete"
                    title="Delete"
                    disabled={isPending}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
