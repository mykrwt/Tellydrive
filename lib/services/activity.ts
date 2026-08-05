import { db } from "@/lib/db";

export interface ActivityRow {
  id: number;
  user_id: string;
  type: string;
  detail: string | null;
  meta: string | null;
  created_at: string;
}

export function logActivity(
  userId: string,
  type: string,
  detail?: string,
  meta?: unknown,
) {
  db()
    .prepare(
      "INSERT INTO activity (user_id, type, detail, meta) VALUES (?, ?, ?, ?)",
    )
    .run(userId, type, detail ?? null, meta ? JSON.stringify(meta) : null);
}

export function listActivity(userId: string, limit = 50): ActivityRow[] {
  return db()
    .prepare(
      "SELECT * FROM activity WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT ?",
    )
    .all(userId, limit) as ActivityRow[];
}

export function listAllActivity(limit = 200): ActivityRow[] {
  return db()
    .prepare("SELECT * FROM activity ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(limit) as ActivityRow[];
}
