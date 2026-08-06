"use client";

import { motion } from "framer-motion";

export function SelectionBar({
  count,
  onDelete,
  onDownload,
  onClear,
}: {
  count: number;
  onDelete: () => void;
  onDownload: () => void;
  onClear: () => void;
}) {
  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 16, opacity: 0 }}
      className="selection-bar"
    >
      <span>
        {count} selected
      </span>
      <div className="selection-actions">
        <button onClick={onDownload}>Download</button>
        <button onClick={onDelete} className="danger">
          Delete
        </button>
        <button onClick={onClear} className="ghost">
          Clear
        </button>
      </div>
    </motion.div>
  );
}
