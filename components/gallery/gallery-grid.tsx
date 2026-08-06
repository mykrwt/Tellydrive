"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Download, Play, Trash2 } from "lucide-react";
import type { ClientFile } from "./index";

function isVideo(mime: string) {
  return mime.startsWith("video/");
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

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

function masonrySpan(file: ClientFile) {
  const ratio = file.width && file.height ? file.height / file.width : 1;
  if (ratio >= 1.45) return 26;
  if (ratio <= 0.75) return 14;
  return 19;
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
    <div className="tb-gallery-groups">
      {groups.map((group) => (
        <section key={group.key} className="tb-gallery-group" aria-label={group.label}>
          <div className="tb-gallery-group-head">
            <h3>{group.label}</h3>
            <span>{group.files.length} {group.files.length === 1 ? "item" : "items"}</span>
          </div>

          <div className="tb-masonry-grid">
            {group.files.map((file, index) => {
              const isSel = selected.has(file.id);
              const video = isVideo(file.mimeType);
              const isImage = file.mimeType.startsWith("image/");
              const thumbUrl = isImage || video ? `/api/files/${file.id}?thumbnail=1` : null;
              const canPreview = isImage || video;
              const span = masonrySpan(file);

              return (
                <motion.article
                  key={file.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.015, 0.22), duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
                  className={`tb-media-card ${isSel ? "selected" : ""}`}
                  style={{ gridRow: `span ${span}` }}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey) {
                      onSelect(file.id, true);
                      return;
                    }
                    if (canPreview && onOpen) {
                      onOpen(file);
                      return;
                    }
                    onSelect(file.id);
                  }}
                  onContextMenu={(event) => onContext(event, file)}
                  onDoubleClick={() => onDownload(file)}
                  role="button"
                  tabIndex={0}
                  aria-label={file.name}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && canPreview && onOpen) onOpen(file);
                  }}
                >
                  <button
                    type="button"
                    className={`tb-select-dot ${isSel ? "checked" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(file.id, true);
                    }}
                    aria-label={isSel ? "Deselect item" : "Select item"}
                  >
                    {isSel ? "✓" : ""}
                  </button>

                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbUrl} alt={file.name} loading="lazy" decoding="async" className="tb-media-image" />
                  ) : (
                    <div className="tb-media-fallback">
                      <span>{file.name.slice(0, 1).toUpperCase()}</span>
                    </div>
                  )}

                  <div className="tb-media-overlay" />
                  <div className="tb-media-meta">
                    <div>
                      <strong title={file.name}>{file.name}</strong>
                      <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                    </div>
                    {video ? (
                      <span className="tb-media-kind-pill"><Play size={12} fill="currentColor" /> Video</span>
                    ) : null}
                  </div>

                  <div className="tb-media-actions">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDownload(file);
                      }}
                      aria-label="Download"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(file);
                      }}
                      aria-label="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
