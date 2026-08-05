import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) return Response.json({ error: "Forbidden" }, { status: 403 });
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const users = db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.is_suspended, u.is_admin, u.storage_used_bytes,
              u.created_at, u.last_active_at, p.name AS plan, p.id AS plan_id,
              (SELECT COUNT(*) FROM files f WHERE f.user_id=u.id AND f.deleted_at IS NULL) AS files
       FROM users u JOIN plans p ON p.id=u.plan_id
       WHERE (u.name LIKE ? OR u.email LIKE ? OR u.id LIKE ?)
       ORDER BY u.created_at DESC`,
    )
    .all(`%${q}%`, `%${q}%`, `%${q}%`) as any[];
  return Response.json({ users });
}
