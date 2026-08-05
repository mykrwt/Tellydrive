import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { userOverview } from "@/lib/services/stats";
import { getPlan } from "@/lib/services/users";
import { listFiles } from "@/lib/services/files";
import { listActivity } from "@/lib/services/activity";
import { formatBytes, formatDate } from "@/lib/config";
import { fileIcon } from "@/lib/ui";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) return null;

  const plan = getPlan(user.plan_id);
  const overview = userOverview(user.id);
  const recent = listFiles({ userId: user.id, sort: "newest" }).slice(0, 8);
  const activity = listActivity(user.id, 6);
  const percent = plan.storage_bytes
    ? (overview.storageUsedBytes / plan.storage_bytes) * 100
    : 0;

  return (
    <>
      <div className="dash-top">
        <div>
          <p className="eyebrow"><span /> YOUR STORAGE</p>
          <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}.</h1>
          <p>Here&apos;s what&apos;s happening in your space.</p>
        </div>
        <Link className="button button-primary" href="/dashboard/upload">+ Upload files</Link>
      </div>

      <div className="dash-stats">
        <article>
          <span>STORAGE USED</span>
          <strong>{formatBytes(overview.storageUsedBytes)} <small>of {formatBytes(overview.storageLimitBytes)}</small></strong>
          <div className="big-progress"><i style={{ width: `${Math.min(100, percent)}%` }} /></div>
          <p>{formatBytes(Math.max(0, overview.storageLimitBytes - overview.storageUsedBytes))} remaining on {plan.name}</p>
        </article>
        <article>
          <span>TOTAL FILES</span>
          <strong>{overview.totalFiles}</strong>
          <p>{overview.images} images · {overview.videos} videos</p>
        </article>
        <article>
          <span>THIS MONTH</span>
          <strong>{overview.thisMonthUploads}</strong>
          <p>New uploads</p>
        </article>
      </div>

      <div className="recent-head">
        <div>
          <h2>Recent uploads</h2>
          <p>Your latest files, all in one place.</p>
        </div>
        <Link href="/dashboard/gallery">View all files →</Link>
      </div>

      {recent.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">↥</span>
          <h3>Nothing here yet</h3>
          <p>Upload your first images or videos to see them here.</p>
          <Link className="button button-primary" href="/dashboard/upload">Upload files</Link>
        </div>
      ) : (
        <div className="recent-grid">
          {recent.map((f) => (
            <article key={f.id} className="file-card">
              <div className={`file-thumb ${f.is_image ? "is-image" : "is-video"}`}>
                {f.is_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${f.id}/content`} alt={f.name} loading="lazy" />
                ) : (
                  <span>▶</span>
                )}
              </div>
              <div>
                <b>{f.name}</b>
                <small>{formatBytes(f.size_bytes)} · {formatDate(f.created_at)}</small>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="recent-head activity-head">
        <div>
          <h2>Recent activity</h2>
          <p>Latest actions in your account.</p>
        </div>
        <Link href="/dashboard/activity">View all →</Link>
      </div>
      <div className="activity-list">
        {activity.map((a) => (
          <div key={a.id} className="activity-row">
            <span className="activity-icon">{fileIcon(a.type)}</span>
            <div>
              <b>{a.detail ?? a.type}</b>
              <small>{a.type.replace(".", " · ")} — {formatDate(a.created_at)}</small>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
