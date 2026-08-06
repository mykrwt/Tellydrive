import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { findUserById, getAdminOverview, getFilesForUser } from "@/lib/telegram-store";
import { DashboardNav } from "@/components/dashboard-nav";
import { AdminUploadPanel } from "@/components/admin/upload-panel";
import { UserTable } from "@/components/admin/user-table";
import { formatBytes } from "@/lib/format";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const admin = await requireAdmin();
  const user = await findUserById(admin.id);
  if (!user) redirect("/sign-in");

  const [overview, recent] = await Promise.all([
    getAdminOverview(),
    getFilesForUser(admin.id, { sortBy: "date", sortOrder: "desc", limit: 20 }),
  ]);

  const safeRecent = recent.map((f) => ({
    id: f.id,
    name: f.name,
    size: f.size,
    mimeType: f.mimeType,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    chunked: f.chunked,
    chunkCount: f.chunkCount,
    folderId: f.folderId,
  }));

  const t = overview.totals;
  const modeLabel = overview.mode === "telegram" ? "Telegram" : overview.mode === "local" ? "Local (dev)" : "Unconfigured";

  const stats = [
    { label: "Users", value: String(t.users), icon: "👥" },
    { label: "Files", value: String(t.files), icon: "🗂" },
    { label: "Folders", value: String(t.folders), icon: "📁" },
    { label: "Storage used", value: formatBytes(t.bytes), icon: "💾" },
    { label: "Media / Docs", value: `${t.images + t.videos} / ${t.documents}`, icon: "🖼" },
    { label: "Database", value: modeLabel, icon: "🗄" },
  ];

  return (
    <main className="dashboard-page gallery-page">
      <DashboardNav userName={user.name} isAdmin={true} />

      <div className="admin-shell">
        <header className="admin-header">
          <div>
            <span className="eyebrow">ADMINISTRATION</span>
            <h1>Admin</h1>
            <p>Administrator-only tools, uploads and instance settings.</p>
          </div>
          <div className="admin-db-pill">
            <span className={`status-dot ${overview.mode}`} />
            Revision {overview.revision} · {modeLabel}
          </div>
        </header>

        <div className="admin-stats">
          {stats.map((s) => (
            <div key={s.label} className="ad-stat">
              <span className="ad-stat-icon">{s.icon}</span>
              <div>
                <span className="ad-stat-value">{s.value}</span>
                <span className="ad-stat-label">{s.label}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="admin-grid">
          <AdminUploadPanel initialRecent={safeRecent} isAdminAccount={true} />
          <UserTable users={overview.users} currentAdminId={admin.id} />
        </div>

        <section className="ad-card ad-tools">
          <div className="ad-card-head">
            <div>
              <h3>Tools</h3>
              <p>Future admin-only capabilities — reserved slots, ready to be enabled.</p>
            </div>
          </div>
          <div className="ad-tool-grid">
            <div className="ad-tool">
              <span className="ad-tool-icon">🛡</span>
              <strong>Storage quotas</strong>
              <p>Per-user space limits and usage alerts.</p>
              <span className="mini-badge">coming soon</span>
            </div>
            <div className="ad-tool">
              <span className="ad-tool-icon">🗄</span>
              <strong>Database backup</strong>
              <p>Download or rotate the account database snapshot.</p>
              <span className="mini-badge">coming soon</span>
            </div>
            <div className="ad-tool">
              <span className="ad-tool-icon">📨</span>
              <strong>Invites &amp; signups</strong>
              <p>Invite-only mode and pending invitation management.</p>
              <span className="mini-badge">coming soon</span>
            </div>
            <div className="ad-tool">
              <span className="ad-tool-icon">⚙️</span>
              <strong>Platform settings</strong>
              <p>Rate limits, feature flags and storage configuration.</p>
              <span className="mini-badge">coming soon</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
