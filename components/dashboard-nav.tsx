"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";

function NavIcon({ kind }: { kind: "gallery" | "files" | "admin" }) {
  if (kind === "gallery") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8.5" cy="8.5" r="1.6" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    );
  }
  if (kind === "files") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export function DashboardNav({ userName, isAdmin }: { userName: string; isAdmin: boolean }) {
  const pathname = usePathname();

  const items = [
    { href: "/dashboard", label: "Gallery", kind: "gallery" as const, exact: true },
    { href: "/dashboard/files", label: "Files", kind: "files" as const, exact: true },
    ...(isAdmin ? [{ href: "/dashboard/admin", label: "Admin", kind: "admin" as const, exact: true }] : []),
  ];

  return (
    <nav className="dashboard-nav gallery-nav">
      <div className="dash-nav-left">
        <Link href="/dashboard" aria-label="Tellybase home">
          <Logo />
        </Link>
      </div>
      <div className="dash-nav-links" role="navigation" aria-label="Dashboard sections">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`dash-nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
              <NavIcon kind={item.kind} />
              {item.label}
              {item.label === "Admin" && <span className="dash-nav-admin-badge">ADMIN</span>}
            </Link>
          );
        })}
      </div>
      <div className="gallery-nav-actions">
        <span className="gallery-user">{userName.split(" ")[0]}</span>
        <SignOutButton />
      </div>
    </nav>
  );
}
