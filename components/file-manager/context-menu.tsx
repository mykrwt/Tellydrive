"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { formatBytes } from "./helpers";

export type MenuTarget =
  | { type: "folder"; id: string; name: string; itemCount?: number }
  | { type: "file"; id: string; name: string; mimeType: string; size: number };

export function FileManagerContextMenu({
  x,
  y,
  target,
  onClose,
  onOpen,
  onDownload,
  onRename,
  onMove,
  onDelete,
}: {
  x: number;
  y: number;
  target: MenuTarget;
  onClose: () => void;
  onOpen: () => void;
  onDownload: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      const targetEl = "touches" in e ? (e.touches[0]?.target as Node) : (e.target as Node);
      if (ref.current && targetEl && !ref.current.contains(targetEl)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const isFolder = target.type === "folder";

  // Prevent menu overflow
  const menuWidth = 230;
  const menuHeight = isFolder ? 220 : 260;
  const posX = typeof window !== "undefined" ? Math.max(12, Math.min(x, window.innerWidth - menuWidth - 16)) : x;
  const posY = typeof window !== "undefined" ? Math.max(12, Math.min(y, window.innerHeight - menuHeight - 16)) : y;

  return (
    <motion.div
      ref={ref}
      className="context-menu fm-context-menu"
      style={{ left: posX, top: posY }}
      role="menu"
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
    >
      <div className="ctx-head" title={target.name}>
        <div className="ctx-head-icon">
          {isFolder ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          )}
        </div>
        <span className="ctx-head-title">{target.name}</span>
      </div>

      <div className="ctx-items">
        <button role="menuitem" className="ctx-btn" onClick={onOpen}>
          <div className="ctx-btn-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isFolder ? (
                <>
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  <path d="M13 11l3 3-3 3" />
                </>
              ) : (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
            <span>{isFolder ? "Open Folder" : "Preview / Open"}</span>
          </div>
        </button>

        {!isFolder && (
          <button role="menuitem" className="ctx-btn" onClick={onDownload}>
            <div className="ctx-btn-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download</span>
            </div>
          </button>
        )}

        <button role="menuitem" className="ctx-btn" onClick={onRename}>
          <div className="ctx-btn-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
            <span>Rename</span>
          </div>
        </button>

        <button role="menuitem" className="ctx-btn" onClick={onMove}>
          <div className="ctx-btn-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 3h5v5" />
              <path d="M8 21H3v-5" />
              <path d="M21 3l-7 7" />
              <path d="M3 21l7-7" />
            </svg>
            <span>Move to folder…</span>
          </div>
        </button>

        <div className="ctx-sep" />

        <button role="menuitem" className="ctx-btn danger" onClick={onDelete}>
          <div className="ctx-btn-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span>Delete</span>
          </div>
        </button>
      </div>

      <div className="ctx-foot">
        {isFolder ? "Folder" : `${formatBytes(target.size)}`}
      </div>
    </motion.div>
  );
}
