"use client";

import type { ClientFile } from "./index";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function GalleryList({
  files,
  selected,
  onSelect,
  onContext,
  onDownload,
  onDelete,
}: {
  files: ClientFile[];
  selected: Set<string>;
  onSelect: (id: string, multi?: boolean) => void;
  onContext: (e: React.MouseEvent, f: ClientFile) => void;
  onDownload: (f: ClientFile) => void;
  onDelete: (f: ClientFile) => void;
}) {
  return (
    <div className="list-wrap" role="table" aria-label="Files">
      <div className="list-head" role="row">
        <span role="columnheader" style={{ width: 36 }} />
        <span role="columnheader">Name</span>
        <span role="columnheader">Size</span>
        <span role="columnheader">Type</span>
        <span role="columnheader">Modified</span>
        <span role="columnheader" style={{ width: 80 }} />
      </div>
      {files.map((file) => {
        const isSel = selected.has(file.id);
        return (
          <div
            key={file.id}
            role="row"
            className={`list-row ${isSel ? "selected" : ""}`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) onSelect(file.id, true);
              else onSelect(file.id);
            }}
            onContextMenu={(e) => onContext(e, file)}
            onDoubleClick={() => onDownload(file)}
          >
            <span role="cell">
              <button
                className={`check small ${isSel ? "checked" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(file.id, true);
                }}
                aria-label={isSel ? "Deselect" : "Select"}
              >
                {isSel ? "✓" : ""}
              </button>
            </span>
            <span role="cell" className="list-name">
              <span className="file-icon">
                {file.mimeType.startsWith("video/") ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                )}
              </span>
              <span title={file.name}>{file.name}</span>
              {file.chunked && <span className="mini-badge">chunked</span>}
            </span>
            <span role="cell" className="muted">
              {formatSize(file.size)}
            </span>
            <span role="cell" className="muted">
              {file.mimeType.split("/")[1]?.toUpperCase() || "FILE"}
            </span>
            <span role="cell" className="muted">
              {new Date(file.createdAt).toLocaleDateString()}
            </span>
            <span role="cell" className="row-actions">
              <button onClick={(e) => { e.stopPropagation(); onDownload(file); }} aria-label="Download">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(file); }} aria-label="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
