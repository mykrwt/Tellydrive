"use client";

import { motion } from "framer-motion";
import type { ClientFile } from "./index";

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
    <div className="grid-wrap gp-grid">
      {files.map((file, idx) => {
        const isSel = selected.has(file.id);
        const video = isVideo(file.mimeType);
        const isImage = file.mimeType.startsWith("image/");
        const thumbUrl =
          isImage || video ? `/api/files/${file.id}?thumbnail=1` : null;

        const canPreview = isImage || video;

        return (
          <motion.div
            key={file.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(idx * 0.01, 0.24), duration: 0.26, ease: [0.2, 0.7, 0.2, 1] }}
            className={`file-card gp-card ${isSel ? "selected" : ""} ${canPreview ? "previewable" : ""}`}
            onClick={(e) => {
              // If previewable, single click opens viewer (Google Photos behavior)
              // Modifier keys toggle selection
              if (e.metaKey || e.ctrlKey || e.shiftKey) {
                onSelect(file.id, true);
                return;
              }
              if (canPreview && onOpen) {
                onOpen(file);
                return;
              }
              onSelect(file.id);
            }}
            onContextMenu={(e) => onContext(e, file)}
            onDoubleClick={() => onDownload(file)}
            role="button"
            tabIndex={0}
            aria-label={`${file.name}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canPreview && onOpen) onOpen(file);
            }}
          >
            <div className="card-media gp-media">
              {/* Selection check — Google Photos style: circle top-left, visible on hover/selection */}
              <button
                className={`check gp-check ${isSel ? "checked" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(file.id, true);
                }}
                aria-label={isSel ? "Deselect" : "Select"}
              >
                {isSel ? "✓" : ""}
              </button>

              {/* Media */}
              {thumbUrl && isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbUrl} alt={file.name} loading="lazy" decoding="async" />
              ) : video ? (
                <>
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbUrl} alt={file.name} loading="lazy" decoding="async" className="video-thumb" />
                  ) : null}
                  <div className="gp-video-overlay" aria-hidden>
                    <span className="gp-play">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    </span>
                  </div>
                  <span className="gp-video-badge">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    VIDEO
                  </span>
                  {file.duration ? (
                    <span className="gp-duration">
                      {Math.floor(file.duration / 60)}:{String(Math.floor(file.duration % 60)).padStart(2, "0")}
                    </span>
                  ) : null}
                </>
              ) : (
                <div className="media-placeholder image gp-fallback">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </div>
              )}

              {/* Gradient scrim + filename like Google Photos */}
              <div className="gp-scrim" />
              <div className="gp-caption">
                <span className="gp-name" title={file.name}>{file.name}</span>
              </div>

              {/* Hover actions — subtle, Google Photos style */}
              <div className="card-hover-actions gp-actions">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(file);
                  }}
                  aria-label="Download"
                  title="Download"
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
                  title="Delete"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
