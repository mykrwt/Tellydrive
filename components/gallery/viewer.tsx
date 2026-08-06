"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ClientFile } from "./index";

function isVideo(m: string) { return m.startsWith("video/"); }
function isImage(m: string) { return m.startsWith("image/"); }

export function GalleryViewer({
  files,
  index,
  onClose,
  onChange,
  onDownload,
}: {
  files: ClientFile[];
  index: number;
  onClose: () => void;
  onChange: (i: number) => void;
  onDownload: (f: ClientFile) => void;
}) {
  const file = files[index];
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prev = useCallback(() => {
    if (index > 0) {
      setLoaded(false); setError(null);
      onChange(index - 1);
    }
  }, [index, onChange]);
  const next = useCallback(() => {
    if (index < files.length - 1) {
      setLoaded(false); setError(null);
      onChange(index + 1);
    }
  }, [index, files.length, onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  // lock scroll
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  if (!file) return null;

  const video = isVideo(file.mimeType);
  const image = isImage(file.mimeType);

  // Use proxied streaming endpoint so chunked files are stitched server-side
  // and the viewer always shows the original bytes at full quality.
  // For images this is full-res; for videos it enables playback.
  const src = `/api/files/${file.id}?download=1&proxy=1&inline=1`;

  // Also prepare a thumbnail fallback for images while full-res loads? We show src directly.
  return (
    <motion.div
      className="lightbox"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="lightbox-topbar" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-topbar-left">
          <button className="lightbox-icon-btn" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
          </button>
          <div className="lightbox-title-wrap">
            <span className="lightbox-name" title={file.name}>{file.name}</span>
            <span className="lightbox-meta">{file.mimeType} • {(file.size / (1024 * 1024)).toFixed(2)} MB</span>
          </div>
        </div>
        <div className="lightbox-topbar-right">
          <button className="lightbox-icon-btn" onClick={() => onDownload(file)} aria-label="Download">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          </button>
        </div>
      </div>

      {/* Prev / Next */}
      {files.length > 1 && (
        <>
          <button
            className="lightbox-nav prev"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            disabled={index === 0}
            aria-label="Previous"
            style={{ opacity: index === 0 ? 0.35 : 1, pointerEvents: index === 0 ? "none" as const : undefined }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            className="lightbox-nav next"
            onClick={(e) => { e.stopPropagation(); next(); }}
            disabled={index === files.length - 1}
            aria-label="Next"
            style={{ opacity: index === files.length - 1 ? 0.35 : 1, pointerEvents: index === files.length - 1 ? "none" as const : undefined }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </>
      )}

      {/* Counter */}
      <div className="lightbox-counter" onClick={(e) => e.stopPropagation()}>
        {index + 1} / {files.length}
      </div>

      {/* Stage */}
      <div className="lightbox-stage" onClick={(e) => e.stopPropagation()}>
        <AnimatePresence mode="wait">
          <motion.div
            key={file.id}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            className="lightbox-media-wrap"
          >
            {!loaded && (
              <div className="lightbox-loading">
                <span className="spinner light" />
              </div>
            )}
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={file.name}
                className="lightbox-image"
                style={{ opacity: loaded ? 1 : 0 }}
                onLoad={() => setLoaded(true)}
                onError={() => { setError("Failed to load image"); setLoaded(true); }}
                draggable={false}
              />
            ) : video ? (
              <video
                key={file.id}
                src={src}
                controls
                autoPlay
                playsInline
                preload="metadata"
                className="lightbox-video"
                style={{ opacity: loaded ? 1 : 0 }}
                onLoadedData={() => setLoaded(true)}
                onError={() => setError("Failed to load video")}
              />
            ) : (
              <div className="lightbox-fallback">
                <div className="fallback-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                </div>
                <p>{file.name}</p>
                <button className="btn btn-primary" onClick={() => onDownload(file)}>Download</button>
              </div>
            )}
            {error && <div className="lightbox-error">{error}</div>}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom caption like Google Photos */}
      <div className="lightbox-caption" onClick={(e) => e.stopPropagation()}>
        <span>{file.name}</span>
        <span className="muted"> • {new Date(file.createdAt).toLocaleString()}</span>
      </div>
    </motion.div>
  );
}
