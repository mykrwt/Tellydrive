"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";

interface Announcement {
  id: number;
  title: string;
  body: string | null;
  active: number;
  created_at: string;
}

export function AdminContent({
  initialAnnouncements,
  maintenance,
  retention,
}: {
  initialAnnouncements: Announcement[];
  maintenance: boolean;
  retention: number;
}) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [active, setActive] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(maintenance);
  const [recycleDays, setRecycleDays] = useState(retention);

  const post = async () => {
    if (!title.trim()) return;
    await api("/api/admin/announcements", {
      method: "POST",
      body: JSON.stringify({ title, body, active }),
    });
    setTitle("");
    setBody("");
    reloadAnnouncements();
  };

  const reloadAnnouncements = async () => {
    const data = await api<{ announcements: Announcement[] }>("/api/admin/announcements");
    setAnnouncements(data.announcements);
  };

  const del = async (id: number) => {
    await api(`/api/admin/announcements/${id}`, { method: "DELETE" });
    reloadAnnouncements();
  };

  const saveSettings = async () => {
    await api("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({ maintenance: maintenanceMode, recycle_days: Number(recycleDays) }),
    });
    alert("Settings saved");
  };

  return (
    <div className="admin-grid">
      <div className="card">
        <h3>Platform settings</h3>
        <div className="settings-grid">
          <label className="check">
            <input type="checkbox" checked={maintenanceMode} onChange={(e) => setMaintenanceMode(e.target.checked)} />
            Maintenance mode (block uploads & show notice)
          </label>
          <label>Recycle Bin retention (days)
            <input type="number" value={recycleDays} onChange={(e) => setRecycleDays(Number(e.target.value))} />
          </label>
        </div>
        <button className="button button-primary" onClick={saveSettings}>Save settings</button>
      </div>

      <div className="card">
        <h3>Post announcement</h3>
        <div className="form-grid">
          <label className="full">Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title" /></label>
          <label className="full">Body<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} /></label>
          <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
        </div>
        <button className="button button-primary" onClick={post}>Post announcement</button>
      </div>

      <div className="card full-card">
        <h3>Announcements</h3>
        {announcements.length === 0 ? (
          <div className="empty-state small"><p>No announcements yet.</p></div>
        ) : (
          <div className="activity-list">
            {announcements.map((a) => (
              <div key={a.id} className="activity-row">
                <div>
                  <b>{a.title}</b>
                  <small>{a.body ?? ""} · {a.active ? "active" : "inactive"}</small>
                </div>
                <button className="button button-quiet danger" onClick={() => del(a.id)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
