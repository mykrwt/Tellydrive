"use client";

import { ArrowUpDown, Grid2x2, List, Search, SlidersHorizontal, Upload } from "lucide-react";

type Props = {
  query: string;
  onQuery: (v: string) => void;
  mime: "all" | "image" | "video";
  onMime: (v: "all" | "image" | "video") => void;
  sortBy: "date" | "name" | "size";
  onSortBy: (v: "date" | "name" | "size") => void;
  sortOrder: "asc" | "desc";
  onSortOrder: (v: "asc" | "desc") => void;
  view: "grid" | "list";
  onView: (v: "grid" | "list") => void;
  count: number;
  onUpload: () => void;
};

export function GalleryToolbar({
  query,
  onQuery,
  mime,
  onMime,
  sortBy,
  onSortBy,
  sortOrder,
  onSortOrder,
  view,
  onView,
  count,
  onUpload,
}: Props) {
  return (
    <div className="tb-toolbar gallery sticky">
      <div className="tb-toolbar-main">
        <div className="tb-search-field">
          <Search size={16} strokeWidth={2} />
          <input
            placeholder="Search photos and videos"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            aria-label="Search gallery"
          />
          {query ? (
            <button className="tb-clear-button" onClick={() => onQuery("")} aria-label="Clear search">
              ×
            </button>
          ) : null}
        </div>

        <div className="tb-segmented-filter" role="tablist" aria-label="Gallery filter">
          {[
            { key: "all", label: "All" },
            { key: "image", label: "Photos" },
            { key: "video", label: "Videos" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={mime === item.key}
              className={mime === item.key ? "active" : ""}
              onClick={() => onMime(item.key as typeof mime)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tb-toolbar-actions">
        <span className="tb-inline-pill subtle"><SlidersHorizontal size={14} /> {count} items</span>
        <label className="tb-select-wrap" aria-label="Sort gallery">
          <ArrowUpDown size={14} />
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(event) => {
              const [by, order] = event.target.value.split("-") as [typeof sortBy, typeof sortOrder];
              onSortBy(by);
              onSortOrder(order);
            }}
          >
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="size-desc">Largest first</option>
            <option value="size-asc">Smallest first</option>
          </select>
        </label>

        <div className="tb-view-toggle" role="group" aria-label="Gallery view toggle">
          <button
            type="button"
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            className={view === "grid" ? "active" : ""}
            onClick={() => onView("grid")}
          >
            <Grid2x2 size={15} />
          </button>
          <button
            type="button"
            aria-label="List view"
            aria-pressed={view === "list"}
            className={view === "list" ? "active" : ""}
            onClick={() => onView("list")}
          >
            <List size={15} />
          </button>
        </div>

        <button type="button" className="tb-primary-button toolbar" onClick={onUpload}>
          <Upload size={16} />
          <span>Upload</span>
        </button>
      </div>
    </div>
  );
}
