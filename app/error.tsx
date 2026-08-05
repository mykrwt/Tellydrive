"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh", padding: "2rem" }}>
      <div className="card" style={{ maxWidth: "480px", width: "100%", textAlign: "center", padding: "2.5rem 2rem" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>⚡</div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "0.5rem" }}>Something went wrong</h2>
        <p style={{ color: "var(--muted)", marginBottom: "1.5rem", fontSize: "0.9375rem" }}>
          A server error occurred. Click reload to try again.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <button onClick={() => reset()} className="button button-primary">
            Reload page
          </button>
          <Link href="/" className="button button-quiet" style={{ textDecoration: "none" }}>
            Return home
          </Link>
        </div>
      </div>
    </div>
  );
}
