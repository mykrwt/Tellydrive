"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { ClientFile } from "./index";

function isVideo(mime: string) {
  return mime.startsWith("video/");
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Google Photos-style day headers: Today / Yesterday / weekday / month day / full date
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  const now = new Date();
  const t = startOfDay(d);
  const today = startOfDay(now);
  const yesterday = today - 86_400_000;
  if (t === today) return "Today";
  if (t === yesterday) return "Yesterday";
  const diffDays = Math.round((today - t) / 86_400_000);
  if (diffDays > 0 && diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

type Group = { key: string; label: string; files: ClientFile[] };

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
  // Group by calendar day, preserving the sort order of the incoming list
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const file of files) {
      const key = new Date(file.createdAt).toDateString();
      let group = map.get(key);
      if (!group) {
        group = { key, label: dayLabel(file.createdAt), files: [] };
        map.set(key, group);
      }
      group.files.push(file);
    }
    return Array.from(map.values());
  }, [files]);

  return (
    <div className="grid-wrap gp-grid">
      {groups.map((group) => (
        <section key={group.key} className="gp-day-group" aria-label={group.label}>
          <div className="gp-day-head">
            <h3>{group.label}</h3>
            <span>
              {group.files.length} {group.files.length === 1 ? "item" : "items"}
            </span>
          </div>
          <div className="gp-day-grid">
            {group.files.map((file, idx) => {
              const isSel = selected.has(file.id);
              const video = isVideo(file.mimeType);
              const isImage = file.mimeType.startsWith("image/");
              const thumbUrl = isImage || video ? `/api/files/${file.id}?thumbnail=1` : null;

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
                    // Single click opens viewer (Google Photos behavior); modifiers select
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
        </section>
      ))}
    </div>
  );
}
