import { currentUser } from "@/lib/auth";
import { listActivity } from "@/lib/services/activity";
import { formatDate } from "@/lib/config";
import { fileIcon } from "@/lib/ui";

export default async function ActivityPage() {
  const user = await currentUser();
  if (!user) return null;
  const activity = listActivity(user.id, 200);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow"><span /> ACTIVITY HISTORY</p>
          <h1>Your activity</h1>
          <p>Every action you take in your account is logged here.</p>
        </div>
      </div>
      <div className="card">
        {activity.length === 0 ? (
          <div className="empty-state small"><p>No activity yet.</p></div>
        ) : (
          <div className="activity-list">
            {activity.map((a) => (
              <div key={a.id} className="activity-row">
                <span className="activity-icon">{fileIcon(a.type)}</span>
                <div>
                  <b>{a.detail ?? a.type}</b>
                  <small>{a.type} — {formatDate(a.created_at)}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
