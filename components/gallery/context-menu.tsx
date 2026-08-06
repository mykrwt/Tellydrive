"use client";

import { useEffect, useRef } from "react";
import type { ClientFile } from "./index";

export function ContextMenu({
  x,
  y,
  file,
  onClose,
  onDownload,
  onDelete,
  onToggleSelect,
}: {
  x: number;
  y: number;
  file: ClientFile;
  onClose: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onToggleSelect: () => void;
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

  // Keep inside viewport
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 260),
  };

  return (
    <div ref={ref} className="context-menu" style={style} role="menu">
      <div className="ctx-head">{file.name}</div>
      <button role="menuitem" onClick={onToggleSelect}>
        <span>Select</span>
      </button>
      <button role="menuitem" onClick={onDownload}>
        <span>Download</span>
      </button>
      <div className="ctx-sep" />
      <button role="menuitem" className="danger" onClick={onDelete}>
        <span>Delete</span>
      </button>
      <div className="ctx-sep" />
      <div className="ctx-foot">
        {file.chunked ? `Chunked • ${file.chunkCount} parts` : `${file.mimeType} • ${(file.size / 1024 / 1024).toFixed(2)} MB`}
      </div>
    </div>
  );
}
