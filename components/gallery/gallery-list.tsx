"use client";

import { Download, FileImage, Play, Trash2 } from "lucide-react";
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
  onOpen,
}: {
  files: ClientFile[];
  selected: Set<string>;
  onSelect: (id: string, multi?: boolean) => void;
  onContext: (e: React.MouseEvent, f: ClientFile) => void;
  onDownload: (f: ClientFile) => void;
  onDelete: (f: ClientFile) => void;
  onOpen?: (f: ClientFile) => void;
}) {
  return (
    <div className="tb-list-surface" role="table" aria-label="Gallery list">
      <div className="tb-list-head" role="row">
        <span role="columnheader" className="checkbox" />
        <span role="columnheader">Name</span>
        <span role="columnheader">Type</span>
        <span role="columnheader">Size</span>
        <span role="columnheader">Date</span>
        <span role="columnheader" className="actions" />
      </div>

      {files.map((file) => {
        const isSelected = selected.has(file.id);
        const isVideo = file.mimeType.startsWith("video/");
        const canPreview = file.mimeType.startsWith("image/") || isVideo;

        return (
          <div
            key={file.id}
            role="row"
            className={`tb-list-row ${isSelected ? "selected" : ""}`}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) onSelect(file.id, true);
              else if (canPreview && onOpen) onOpen(file);
              else onSelect(file.id);
            }}
            onContextMenu={(event) => onContext(event, file)}
            onDoubleClick={() => {
              if (canPreview && onOpen) onOpen(file);
              else onDownload(file);
            }}
          >
            <span role="cell" className="checkbox">
              <button
                className={`tb-select-dot inline ${isSelected ? "checked" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(file.id, true);
                }}
                aria-label={isSelected ? "Deselect item" : "Select item"}
              >
                {isSelected ? "✓" : ""}
              </button>
            </span>
            <span role="cell" className="tb-list-name-cell">
              <span className={`tb-result-icon ${isVideo ? "video" : "media"}`}>
                {isVideo ? <Play size={14} fill="currentColor" /> : <FileImage size={14} />}
              </span>
              <span className="tb-list-name-copy">
                <strong>{file.name}</strong>
                {file.chunked ? <em>Chunked upload</em> : null}
              </span>
            </span>
            <span role="cell" className="tb-list-muted">{isVideo ? "Video" : "Photo"}</span>
            <span role="cell" className="tb-list-muted">{formatSize(file.size)}</span>
            <span role="cell" className="tb-list-muted">{new Date(file.createdAt).toLocaleDateString()}</span>
            <span role="cell" className="tb-row-actions actions">
              <button onClick={(event) => { event.stopPropagation(); onDownload(file); }} aria-label="Download">
                <Download size={14} />
              </button>
              <button onClick={(event) => { event.stopPropagation(); onDelete(file); }} aria-label="Delete">
                <Trash2 size={14} />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
