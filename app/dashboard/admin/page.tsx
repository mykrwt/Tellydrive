import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { findUserById, getAdminOverview, getFilesForUser } from "@/lib/telegram-store";
import { AdminUploadPanel } from "@/components/admin/upload-panel";
import { UserTable } from "@/components/admin/user-table";
import { formatBytes, formatDate } from "@/lib/format";
import { DashboardChrome } from "@/components/dashboard-chrome";
import { getDashboardSummary } from "@/lib/dashboard-summary";

export const metadata = { title: "Admin" };

type ActivityItem = {
  id: string;
  label: string;
  meta: string;
  tone: "upload" | "login" | "user" | "system";
  time: number;
};

export default async function AdminPage() {
  const admin = await requireAdmin();
  const user = await findUserById(admin.id);
  if (!user) redirect("/sign-in");

  const [overview, recent, summary] = await Promise.all([
    getAdminOverview(),
    getFilesForUser(admin.id, { sortBy: "date", sortOrder: "desc", limit: 20 }),
    getDashboardSummary(admin.id),
  ]);

  const safeRecent = recent.map((file) => ({
    id: file.id,
    name: file.name,
    size: file.size,
    mimeType: file.mimeType,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    chunked: file.chunked,
    chunkCount: file.chunkCount,
    folderId: file.folderId,
  }));

  const totals = overview.totals;
  const modeLabel = overview.mode === "telegram" ? "Telegram" : overview.mode === "local" ? "Local (dev)" : "Unconfigured";
  const imageShare = totals.files > 0 ? Math.round((totals.images / totals.files) * 100) : 0;
  const videoShare = totals.files > 0 ? Math.round((totals.videos / totals.files) * 100) : 0;
  const docShare = totals.files > 0 ? Math.max(0, 100 - imageShare - videoShare) : 0;

  const stats = [
    { label: "Users", value: String(totals.users), hint: "active accounts" },
    { label: "Files", value: String(totals.files), hint: `${totals.folders} folders` },
    { label: "Storage", value: formatBytes(totals.bytes), hint: modeLabel },
    { label: "Uploads", value: String(safeRecent.length), hint: "recent items" },
  ];

  const recentLogins = overview.users
    .filter((entry) => entry.lastLoginAt)
    .sort((a, b) => new Date(b.lastLoginAt ?? 0).getTime() - new Date(a.lastLoginAt ?? 0).getTime())
    .slice(0, 4)
    .map<ActivityItem>((entry) => ({
      id: `login-${entry.id}`,
      label: `${entry.name} signed in`,
      meta: entry.lastLoginAt ? formatDate(entry.lastLoginAt) : "Recently",
      tone: "login",
      time: new Date(entry.lastLoginAt ?? 0).getTime(),
    }));

  const recentUsers = overview.users
    .slice(0, 4)
    .map<ActivityItem>((entry) => ({
      id: `user-${entry.id}`,
      label: `${entry.name} joined TellyBase`,
      meta: formatDate(entry.createdAt),
      tone: "user",
      time: new Date(entry.createdAt).getTime(),
    }));

  const recentUploads = safeRecent.slice(0, 4).map<ActivityItem>((file) => ({
    id: `upload-${file.id}`,
    label: `${file.name} uploaded`,
    meta: `${formatBytes(file.size)} · ${formatDate(file.createdAt)}`,
    tone: "upload",
    time: new Date(file.createdAt).getTime(),
  }));

  const activity = [...recentUploads, ...recentLogins, ...recentUsers]
    .sort((a, b) => b.time - a.time)
    .slice(0, 8);

  const logs: ActivityItem[] = [
    { id: "log-revision", label: `Revision ${overview.revision} saved`, meta: `Updated ${formatDate(overview.updatedAt)}`, tone: "system", time: new Date(overview.updatedAt).getTime() },
    { id: "log-storage", label: `${modeLabel} backend connected`, meta: `${totals.files} indexed files`, tone: "system", time: new Date(overview.updatedAt).getTime() - 1 },
    { id: "log-media", label: `Media library indexed`, meta: `${totals.images + totals.videos} visual items`, tone: "system", time: new Date(overview.updatedAt).getTime() - 2 },
    { id: "log-auth", label: `Access model healthy`, meta: `${overview.users.filter((entry) => entry.role === "admin").length} admin seats`, tone: "system", time: new Date(overview.updatedAt).getTime() - 3 },
  ];

  return (
    <DashboardChrome user={{ name: user.name, email: user.email, isAdmin: true }} summary={summary}>
      <div className="tb-admin-page">
        <section className="tb-admin-hero">
          <div>
            <span className="tb-eyebrow warm">Admin workspace</span>
            <h1>Control the storage layer without the clutter.</h1>
            <p>Compact telemetry, user management, uploads, and system health — all in a single streamlined surface.</p>
          </div>
          <div className="tb-admin-status-card">
            <span className="tb-admin-status-title">Database status</span>
            <strong>{modeLabel}</strong>
            <span>Revision {overview.revision}</span>
          </div>
        </section>

        <section className="tb-admin-stats-grid">
          {stats.map((stat) => (
            <article key={stat.label} className="tb-admin-stat-card">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <p>{stat.hint}</p>
            </article>
          ))}
        </section>

        <section className="tb-admin-grid-primary">
          <AdminUploadPanel initialRecent={safeRecent} isAdminAccount={true} />

          <div className="tb-admin-stack">
            <article className="tb-panel tb-admin-panel compact">
              <div className="tb-panel-head">
                <div>
                  <span className="tb-panel-label">Storage</span>
                  <h2>Usage mix</h2>
                </div>
                <span className="tb-inline-pill">{formatBytes(totals.bytes)}</span>
              </div>
              <div className="tb-admin-breakdown-list">
                <div>
                  <span>Photos</span>
                  <strong>{totals.images}</strong>
                  <em>{imageShare}%</em>
                </div>
                <div>
                  <span>Videos</span>
                  <strong>{totals.videos}</strong>
                  <em>{videoShare}%</em>
                </div>
                <div>
                  <span>Documents</span>
                  <strong>{totals.documents}</strong>
                  <em>{docShare}%</em>
                </div>
              </div>
            </article>

            <article className="tb-panel tb-admin-panel compact">
              <div className="tb-panel-head">
                <div>
                  <span className="tb-panel-label">Overview</span>
                  <h2>Database status</h2>
                </div>
              </div>
              <div className="tb-admin-meta-list">
                <div><span>Mode</span><strong>{modeLabel}</strong></div>
                <div><span>Last update</span><strong>{formatDate(overview.updatedAt)}</strong></div>
                <div><span>Users</span><strong>{totals.users}</strong></div>
                <div><span>Folders</span><strong>{totals.folders}</strong></div>
              </div>
            </article>
          </div>
        </section>

        <section className="tb-admin-grid-secondary">
          <UserTable users={overview.users} currentAdminId={admin.id} />

          <div className="tb-admin-stack">
            <article className="tb-panel tb-admin-panel">
              <div className="tb-panel-head">
                <div>
                  <span className="tb-panel-label">Activity</span>
                  <h2>Recent activity</h2>
                </div>
              </div>
              <div className="tb-admin-activity-list">
                {activity.map((item) => (
                  <div key={item.id} className={`tb-admin-activity-item ${item.tone}`}>
                    <span className="tb-admin-activity-dot" />
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.meta}</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="tb-panel tb-admin-panel">
              <div className="tb-panel-head">
                <div>
                  <span className="tb-panel-label">Logs</span>
                  <h2>System snapshot</h2>
                </div>
              </div>
              <div className="tb-admin-log-list">
                {logs.map((item) => (
                  <div key={item.id} className="tb-admin-log-item">
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.meta}</span>
                    </div>
                    <span className="tb-inline-pill subtle">live</span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      </div>
    </DashboardChrome>
  );
}
