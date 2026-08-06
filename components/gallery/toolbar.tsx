"use client";

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
}: Props) {

  return (
    <div className="gallery-toolbar">
      <div className="toolbar-left">
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            placeholder="Search photos, videos…"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label="Search"
          />
          {query && (
            <button className="clear-search" onClick={() => onQuery("")} aria-label="Clear search">
              ×
            </button>
          )}
        </div>

        <div className="filter-pills">
          <button className={mime === "all" ? "active" : ""} onClick={() => onMime("all")}>
            All
          </button>
          <button className={mime === "image" ? "active" : ""} onClick={() => onMime("image")}>
            Photos
          </button>
          <button className={mime === "video" ? "active" : ""} onClick={() => onMime("video")}>
            Videos
          </button>
        </div>
      </div>

      <div className="toolbar-right">
        <div className="sort-control">
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [by, order] = e.target.value.split("-") as [typeof sortBy, typeof sortOrder];
              onSortBy(by);
              onSortOrder(order);
            }}
            aria-label="Sort"
          >
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="size-desc">Largest first</option>
            <option value="size-asc">Smallest first</option>
          </select>
        </div>

        <div className="view-toggle" role="group" aria-label="View">
          <button
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            className={view === "grid" ? "active" : ""}
            onClick={() => onView("grid")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
          <button
            aria-label="List view"
            aria-pressed={view === "list"}
            className={view === "list" ? "active" : ""}
            onClick={() => onView("list")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M8 6h13" />
              <path d="M8 12h13" />
              <path d="M8 18h13" />
              <path d="M3 6h.01" />
              <path d="M3 12h.01" />
              <path d="M3 18h.01" />
            </svg>
          </button>
        </div>

        <span className="count-pill">
          {count} {count === 1 ? "item" : "items"}
        </span>
      </div>
    </div>
  );
}
