import { db } from "@/lib/db";
import { getUserWithPlan } from "@/lib/services/users";

export interface UserOverview {
  storageUsedBytes: number;
  storageLimitBytes: number;
  totalFiles: number;
  totalFolders: number;
  thisMonthUploads: number;
  images: number;
  videos: number;
}

export function userOverview(userId: string): UserOverview {
  const wp = getUserWithPlan(userId);
  const d = db();
  const files = d
    .prepare(
      "SELECT COUNT(*) AS c, COALESCE(SUM(size_bytes),0) AS s, SUM(is_image) AS imgs, SUM(is_video) AS vids FROM files WHERE user_id=? AND deleted_at IS NULL",
    )
    .get(userId) as {
    c: number;
    s: number;
    imgs: number | null;
    vids: number | null;
  };
  const folders = d
    .prepare(
      "SELECT COUNT(*) AS c FROM folders WHERE user_id=? AND deleted_at IS NULL",
    )
    .get(userId) as { c: number };
  const month = d
    .prepare(
      "SELECT COUNT(*) AS c FROM files WHERE user_id=? AND deleted_at IS NULL AND strftime('%Y-%m', created_at)=strftime('%Y-%m','now')",
    )
    .get(userId) as { c: number };
  return {
    storageUsedBytes: files.s,
    storageLimitBytes: wp?.plan.storage_bytes ?? 0,
    totalFiles: files.c,
    totalFolders: folders.c,
    thisMonthUploads: month.c,
    images: files.imgs ?? 0,
    videos: files.vids ?? 0,
  };
}

export interface AdminStats {
  totalStorageBytes: number;
  totalFiles: number;
  totalImages: number;
  totalVideos: number;
  totalFolders: number;
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  todayUploads: number;
  monthUploads: number;
  dailyUploads: { day: string; count: number; bytes: number }[];
  monthlyUploads: { month: string; count: number; bytes: number }[];
  byPlan: { plan: string; users: number; storage: number; files: number }[];
  perUser: {
    id: string;
    name: string | null;
    email: string | null;
    plan: string;
    storageUsed: number;
    files: number;
    is_suspended: number;
  }[];
}

export function adminStats(): AdminStats {
  const d = db();
  const files = d
    .prepare(
      "SELECT COUNT(*) AS c, COALESCE(SUM(size_bytes),0) AS s, COALESCE(SUM(is_image),0) AS imgs, COALESCE(SUM(is_video),0) AS vids FROM files WHERE deleted_at IS NULL",
    )
    .get() as { c: number; s: number; imgs: number; vids: number };
  const users = d
    .prepare(
      "SELECT COUNT(*) AS c FROM users",
    )
    .get() as { c: number };
  const active = d
    .prepare(
      "SELECT COUNT(*) AS c FROM users WHERE last_active_at IS NOT NULL AND last_active_at >= datetime('now','-7 days')",
    )
    .get() as { c: number };
  const suspended = d
    .prepare("SELECT COUNT(*) AS c FROM users WHERE is_suspended=1")
    .get() as { c: number };
  const today = d
    .prepare(
      "SELECT COUNT(*) AS c FROM files WHERE deleted_at IS NULL AND date(created_at)=date('now')",
    )
    .get() as { c: number };
  const month = d
    .prepare(
      "SELECT COUNT(*) AS c FROM files WHERE deleted_at IS NULL AND strftime('%Y-%m', created_at)=strftime('%Y-%m','now')",
    )
    .get() as { c: number };
  const folders = d.prepare("SELECT COUNT(*) AS c FROM folders WHERE deleted_at IS NULL").get() as { c: number };

  const daily = d
    .prepare(
      "SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(size_bytes),0) AS bytes FROM files WHERE deleted_at IS NULL AND created_at >= datetime('now','-13 days') GROUP BY date(created_at) ORDER BY day",
    )
    .all() as { day: string; count: number; bytes: number }[];

  const monthly = d
    .prepare(
      "SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count, COALESCE(SUM(size_bytes),0) AS bytes FROM files WHERE deleted_at IS NULL GROUP BY month ORDER BY month",
    )
    .all() as { month: string; count: number; bytes: number }[];

  const byPlan = d
    .prepare(
      `SELECT p.name AS plan, COUNT(u.id) AS users, COALESCE(SUM(u.storage_used_bytes),0) AS storage,
              (SELECT COUNT(*) FROM files f WHERE f.user_id = u.id AND f.deleted_at IS NULL) AS files
       FROM plans p LEFT JOIN users u ON u.plan_id = p.id
       GROUP BY p.id ORDER BY p.sort_order`,
    )
    .all() as { plan: string; users: number; storage: number; files: number }[];

  const perUser = d
    .prepare(
      `SELECT u.id, u.name, u.email, p.name AS plan, u.storage_used_bytes AS storageUsed, u.is_suspended,
              (SELECT COUNT(*) FROM files f WHERE f.user_id=u.id AND f.deleted_at IS NULL) AS files
       FROM users u JOIN plans p ON p.id=u.plan_id ORDER BY u.created_at DESC`,
    )
    .all() as {
    id: string;
    name: string | null;
    email: string | null;
    plan: string;
    storageUsed: number;
    is_suspended: number;
    files: number;
  }[];

  return {
    totalStorageBytes: files.s,
    totalFiles: files.c,
    totalImages: files.imgs,
    totalVideos: files.vids,
    totalFolders: folders.c,
    totalUsers: users.c,
    activeUsers: active.c,
    suspendedUsers: suspended.c,
    todayUploads: today.c,
    monthUploads: month.c,
    dailyUploads: daily,
    monthlyUploads: monthly,
    byPlan,
    perUser,
  };
}
