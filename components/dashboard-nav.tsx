"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";

function NavIcon({ kind }: { kind: "gallery" | "files" | "admin" }) {
  if (kind === "gallery") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8.5" cy="8.5" r="1.6" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    );
  }
  if (kind === "files") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export function DashboardNav({ userName, isAdmin }: { userName: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const firstName = userName ? userName.split(" ")[0] : "User";
  const firstLetter = firstName.charAt(0).toUpperCase() || "U";

  const items = [
    { href: "/dashboard", label: "Gallery", kind: "gallery" as const, exact: true },
    { href: "/dashboard/files", label: "Files", kind: "files" as const, exact: true },
    ...(isAdmin ? [{ href: "/dashboard/admin", label: "Admin", kind: "admin" as const, exact: true }] : []),
  ];

  return (
    <>
      <nav className="dashboard-nav gallery-nav" aria-label="Main Navigation">
        <div className="dash-nav-left">
          <Link href="/dashboard" aria-label="TellyDrive home" className="dash-brand-link">
            <Logo />
          </Link>
        </div>

        {/* Desktop center segmented tabs */}
        <div className="dash-nav-links dash-desktop-nav" role="navigation" aria-label="Dashboard sections">
          {items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`dash-nav-link ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <NavIcon kind={item.kind} />
                <span>{item.label}</span>
                {item.label === "Admin" && <span className="dash-nav-admin-badge">ADMIN</span>}
              </Link>
            );
          })}
        </div>

        <div className="gallery-nav-actions">
          <div className="gallery-user-pill" title={userName}>
            <span className="gallery-user-avatar" aria-hidden="true">{firstLetter}</span>
            <span className="gallery-user-name">{firstName}</span>
          </div>
          <SignOutButton />
        </div>
      </nav>

      {/* Mobile bottom app bar */}
      <nav className="dash-bottom-nav" aria-label="Mobile navigation">
        <div className="dash-bottom-nav-inner">
          {items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`dash-bottom-link ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <div className="dash-bottom-icon-wrap">
                  <NavIcon kind={item.kind} />
                  {item.label === "Admin" && <span className="dash-bottom-admin-dot" />}
                </div>
                <span className="dash-bottom-label">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
