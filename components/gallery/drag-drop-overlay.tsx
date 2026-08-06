"use client";

export function DragDropOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="drag-overlay">
      <div className="drag-card">
        <div className="drag-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <h3>Drop to upload</h3>
        <p>Images and videos only • Max 2 GB • Chunked automatically</p>
      </div>
    </div>
  );
}
