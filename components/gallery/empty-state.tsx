"use client";

import { motion } from "framer-motion";

export function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="empty-state"
    >
      <div className="empty-illustration">
        <div className="empty-stack">
          <span />
          <span />
          <span />
        </div>
        <div className="empty-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.6" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </div>
      </div>
      <h3>Your gallery is empty</h3>
      <p>Drag & drop photos or videos here, or click to browse. Supports chunked uploads up to 2 GB — we handle it invisibly.</p>
      <button className="btn-primary" onClick={onUpload}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </svg>
        Upload photos & videos
      </button>
      <span className="empty-hint">Future-ready for folders, albums, favorites & AI search</span>
    </motion.div>
  );
}
