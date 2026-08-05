import { NextRequest } from "next/server";
import { currentUserId } from "@/lib/auth";
import { listActivity } from "@/lib/services/activity";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  return Response.json({ activity: listActivity(userId, limit) });
}
