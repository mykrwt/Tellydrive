import { currentUserId } from "@/lib/auth";
import { userOverview } from "@/lib/services/stats";
import { getUser } from "@/lib/services/users";
import { storageLabel } from "@/lib/storage";
import { formatBytes } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const overview = userOverview(userId);
  const owner = getUser(userId);
  return Response.json({ ...overview, backend: storageLabel(owner), usedLabel: formatBytes(overview.storageUsedBytes), limitLabel: formatBytes(overview.storageLimitBytes) });
}
