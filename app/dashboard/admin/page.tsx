import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { adminStats } from "@/lib/services/stats";
import { formatBytes } from "@/lib/config";

export default async function AdminOverviewPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!user.is_admin) redirect("/dashboard");

  const stats = adminStats();
  const maxDaily = Math.max(1, ...stats.dailyUploads.map((d) => d.count));
  const maxMonthly = Math.max(1, ...stats.monthlyUploads.map((m) => m.count));

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow"><span /> ADMIN · ANALYTICS</p>
          <h1>Platform overview</h1>
          <p>Everything happening across the platform, at a glance.</p>
        </div>
      </div>

      <div className="dash-stats">
        <article>
          <span>TOTAL STORAGE</span>
          <strong>{formatBytes(stats.totalStorageBytes)}</strong>
          <p>across {stats.totalFiles} files</p>
        </article>
        <article>
          <span>USERS</span>
          <strong>{stats.totalUsers}</strong>
          <p>{stats.activeUsers} active (7d) · {stats.suspendedUsers} suspended</p>
        </article>
        <article>
          <span>FILES</span>
          <strong>{stats.totalFiles}</strong>
          <p>{stats.totalImages} images · {stats.totalVideos} videos</p>
        </article>
      </div>

      <div className="admin-grid">
        <div className="card">
          <h3>Uploads this month</h3>
          <p className="hint">{stats.monthUploads} this month · {stats.todayUploads} today</p>
          <div className="bar-chart">
            {stats.monthlyUploads.map((m) => (
              <div key={m.month} className="bar-col">
                <div className="bar-fill" style={{ height: `${(m.count / maxMonthly) * 100}%` }} />
                <span>{m.month.slice(2)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Last 14 days</h3>
          <div className="bar-chart">
            {stats.dailyUploads.map((d) => (
              <div key={d.day} className="bar-col">
                <div className="bar-fill" style={{ height: `${(d.count / maxDaily) * 100}%` }} />
                <span>{d.day.slice(8)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Storage by plan</h3>
        <table className="data-table">
          <thead>
            <tr><th>Plan</th><th>Users</th><th>Files</th><th>Storage</th></tr>
          </thead>
          <tbody>
            {stats.byPlan.map((p) => (
              <tr key={p.plan}>
                <td>{p.plan}</td>
                <td>{p.users}</td>
                <td>{p.files}</td>
                <td>{formatBytes(p.storage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
