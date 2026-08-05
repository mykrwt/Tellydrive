import { db } from "@/lib/db";
import { logActivity } from "@/lib/services/activity";

export interface AnnouncementRow {
  id: number;
  title: string;
  body: string | null;
  active: number;
  created_at: string;
}

export function listAnnouncements(activeOnly = false): AnnouncementRow[] {
  const sql = activeOnly
    ? "SELECT * FROM announcements WHERE active=1 ORDER BY created_at DESC"
    : "SELECT * FROM announcements ORDER BY created_at DESC";
  return db().prepare(sql).all() as AnnouncementRow[];
}

export function adminCreateAnnouncement(title: string, body: string, active: boolean) {
  db()
    .prepare("INSERT INTO announcements (title, body, active) VALUES (?, ?, ?)")
    .run(title, body, active ? 1 : 0);
  return true;
}

export function adminDeleteAnnouncement(id: number) {
  db().prepare("DELETE FROM announcements WHERE id=?").run(id);
  return true;
}

export function setMaintenanceMode(on: boolean) {
  db()
    .prepare(
      "INSERT INTO settings (key,value) VALUES ('maintenance_mode',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(on ? "1" : "0");
  return on;
}

export function maintenanceMode(): boolean {
  const row = db()
    .prepare("SELECT value FROM settings WHERE key='maintenance_mode'")
    .get() as { value: string } | undefined;
  return row?.value === "1";
}

export function getSetting(key: string): string | null {
  const row = db()
    .prepare("SELECT value FROM settings WHERE key=?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

// --- User management (admin) ------------------------------------------------

export function adminSetPlan(userId: string, planId: number) {
  db().prepare("UPDATE users SET plan_id=? WHERE id=?").run(planId, userId);
  logActivity(userId, "admin.plan_changed", "Plan updated by admin");
}

export function adminSetSuspended(userId: string, suspended: boolean) {
  db().prepare("UPDATE users SET is_suspended=? WHERE id=?").run(suspended ? 1 : 0, userId);
  logActivity(userId, "admin.suspend_toggled", suspended ? "Account suspended" : "Account re-enabled");
}

export function adminDeleteUser(userId: string) {
  db().prepare("DELETE FROM activity WHERE user_id=?").run(userId);
  db().prepare("DELETE FROM files WHERE user_id=?").run(userId);
  db().prepare("DELETE FROM folders WHERE user_id=?").run(userId);
  db().prepare("DELETE FROM users WHERE id=?").run(userId);
}
