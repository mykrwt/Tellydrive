"use client";

export function Breadcrumbs() {
  // Future-ready for folders. For now show Home > All Photos hierarchy
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        <li>
          <a href="#" onClick={(e) => e.preventDefault()} aria-current="page">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            My Drive
          </a>
        </li>
        <li aria-hidden="true" className="sep">
          /
        </li>
        <li>
          <span>All Photos</span>
        </li>
        {/* Future: map folder path */}
      </ol>
    </nav>
  );
}
