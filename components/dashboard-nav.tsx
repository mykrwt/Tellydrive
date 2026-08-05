"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links: { href: string; icon: string; label: string; admin?: boolean }[] = [
  { href: "/dashboard", icon: "▦", label: "Overview" },
  { href: "/dashboard/upload", icon: "↥", label: "Upload center" },
  { href: "/dashboard/gallery", icon: "▱", label: "Gallery" },
  { href: "/dashboard/folders", icon: "⌁", label: "Folders" },
  { href: "/dashboard/activity", icon: "◷", label: "Activity" },
  { href: "/dashboard/trash", icon: "🗑", label: "Recycle bin" },
  { href: "/dashboard/plans", icon: "★", label: "Plans & billing" },
  { href: "/dashboard/settings", icon: "⚙", label: "Settings" },
  { href: "/dashboard/admin", icon: "◈", label: "Admin", admin: true },
];

export function DashboardNav({
  planName,
  used,
  limitLabel,
  percent,
  isAdmin,
}: {
  planName: string;
  used: string;
  limitLabel: string;
  percent: number;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  return (
    <aside className="dashboard-side">
      <p className="side-label">YOUR SPACE</p>
      {links
        .filter((l) => !l.admin || isAdmin)
        .map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={active ? "side-current" : undefined}
            >
              {l.icon} <span>{l.label}</span>
            </Link>
          );
        })}
      <div className="side-bottom">
        <div className="side-storage">
          <span>{planName} plan</span>
          <strong>{used} <small>of {limitLabel}</small></strong>
          <div><i style={{ width: `${Math.min(100, percent)}%` }} /></div>
          <Link href="/dashboard/plans">Upgrade plan →</Link>
        </div>
      </div>
    </aside>
  );
}
