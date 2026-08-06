"use client";

import { motion } from "framer-motion";
import type { ClientFile } from "./index";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function isVideo(mime: string) {
  return mime.startsWith("video/");
}

export function GalleryGrid({
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
    <div className="grid-wrap">
      {files.map((file, idx) => {
        const isSel = selected.has(file.id);
        const video = isVideo(file.mimeType);
        // Thumbnail via server-proxied endpoint — never expose raw telegramFileId to client
        const thumbUrl =
          file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/")
            ? `/api/files/${file.id}?thumbnail=1`
            : null;

        return (
          <motion.div
            key={file.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(idx * 0.012, 0.3), duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
            className={`file-card ${isSel ? "selected" : ""}`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) onSelect(file.id, true);
              else onSelect(file.id);
            }}
            onContextMenu={(e) => onContext(e, file)}
            onDoubleClick={() => onDownload(file)}
          >
            <div className="card-media">
              {/* Checkbox */}
              <button
                className={`check ${isSel ? "checked" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(file.id, true);
                }}
                aria-label={isSel ? "Deselect" : "Select"}
              >
                {isSel ? "✓" : ""}
              </button>

              {/* Media preview */}
              {thumbUrl && file.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbUrl} alt={file.name} loading="lazy" decoding="async" />
              ) : video ? (
                <div className="media-placeholder video">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span className="video-badge">VIDEO</span>
                </div>
              ) : (
                <div className="media-placeholder image">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </div>
              )}

              {/* Hover actions */}
              <div className="card-hover-actions">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(file);
                  }}
                  aria-label="Download"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(file);
                  }}
                  aria-label="Delete"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>

              {/* Chunked indicator */}
              {file.chunked && <span className="chunk-badge">Chunked • {file.chunkCount}</span>}
            </div>

            <div className="card-meta">
              <span className="card-name" title={file.name}>
                {file.name}
              </span>
              <span className="card-sub">
                {formatSize(file.size)} • {new Date(file.createdAt).toLocaleDateString()}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
