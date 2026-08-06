"use client";

import { useEffect, useRef } from "react";
import { formatBytes } from "./helpers";

export type MenuTarget =
  | { type: "folder"; id: string; name: string }
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
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const isFolder = target.type === "folder";
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 240),
    top: Math.min(y, window.innerHeight - 320),
  };

  return (
    <div ref={ref} className="context-menu" style={style} role="menu">
      <div className="ctx-head">{target.name}</div>
      <button role="menuitem" onClick={onOpen}>
        <span>{isFolder ? "Open" : "Preview"}</span>
        {!isFolder && <span className="ctx-shortcut">↵</span>}
      </button>
      {!isFolder && (
        <button role="menuitem" onClick={onDownload}>
          <span>Download</span>
        </button>
      )}
      <button role="menuitem" onClick={onRename}>
        <span>Rename</span>
      </button>
      <button role="menuitem" onClick={onMove}>
        <span>Move to…</span>
      </button>
      <div className="ctx-sep" />
      <button role="menuitem" className="danger" onClick={onDelete}>
        <span>Delete</span>
      </button>
      <div className="ctx-sep" />
      <div className="ctx-foot">
        {isFolder ? "Folder" : `${target.mimeType} • ${formatBytes(target.size)}`}
      </div>
    </div>
  );
}
