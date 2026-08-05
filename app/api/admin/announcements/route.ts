import { requireAdmin } from "@/lib/services/admin-guard";
import { adminCreateAnnouncement, listAnnouncements } from "@/lib/services/admin";

export const runtime = "nodejs";

export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ announcements: listAnnouncements() });
}

export async function POST(request: Request) {
  const adminId = await requireAdmin();
  if (!adminId) return Response.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.title) return Response.json({ error: "Title required" }, { status: 400 });
  adminCreateAnnouncement(String(body.title), String(body.body ?? ""), Boolean(body.active));
  return Response.json({ ok: true });
}
