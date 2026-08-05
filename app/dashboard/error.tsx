"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: "2rem" }}>
      <div className="card" style={{ maxWidth: "480px", width: "100%", textAlign: "center", padding: "2.5rem 2rem" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>⚡</div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "0.5rem" }}>Something went wrong</h2>
        <p style={{ color: "var(--muted)", marginBottom: "1.5rem", fontSize: "0.9375rem" }}>
          An error occurred while rendering the dashboard. Try reloading or return home.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <button onClick={() => reset()} className="button button-primary">
            Try again
          </button>
          <a href="/dashboard" className="button button-quiet" style={{ textDecoration: "none" }}>
            Dashboard home
          </a>
        </div>
      </div>
    </div>
  );
}
