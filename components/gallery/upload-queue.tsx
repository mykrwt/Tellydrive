"use client";

import { motion, AnimatePresence } from "framer-motion";

export type QueueItem = {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  file: File;
};

export function UploadQueue({ items, onDismiss }: { items: QueueItem[]; onDismiss: () => void }) {
  if (!items.length) return null;
  const active = items.filter((i) => i.status === "uploading" || i.status === "queued").length;
  const done = items.filter((i) => i.status === "done").length;

  return (
    <div className="upload-queue">
      <div className="queue-head">
        <span>
          {active > 0 ? `Uploading ${active} ${active === 1 ? "file" : "files"}…` : `Completed ${done} uploads`}
        </span>
        <button onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
      <div className="queue-list">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="queue-item"
            >
              <div className="queue-item-main">
                <span className="queue-name" title={item.name}>
                  {item.name}
                </span>
                <span className={`queue-status ${item.status}`}>{item.status === "done" ? "Done" : item.status === "error" ? "Failed" : `${item.progress}%`}</span>
              </div>
              <div className="queue-bar">
                <div className="queue-progress" style={{ width: `${item.progress}%`, opacity: item.status === "error" ? 0.5 : 1 }} />
              </div>
              {item.error && <span className="queue-error">{item.error}</span>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
