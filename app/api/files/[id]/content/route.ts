import { currentUserId } from "@/lib/auth";
import { getOwnedFile } from "@/lib/services/files";
import { getUser } from "@/lib/services/users";
import { readFile } from "@/lib/storage";

export const runtime = "nodejs";

// Streams the file bytes for the authenticated owner. Works for both storage
// backends (Telegram / local) because it goes through the Storage Manager.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const fileId = Number(id);
  if (!Number.isFinite(fileId)) return new Response("Bad request", { status: 400 });

  let file;
  try {
    file = getOwnedFile(userId, fileId);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const owner = getUser(userId);
  try {
    const { stream, contentType, length } = await readFile(
      file.storage_ref,
      file.mime ?? "application/octet-stream",
      owner,
    );
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Content-Length", String(length || file.size_bytes));
    headers.set("Cache-Control", "private, max-age=86400");
    headers.set(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    return new Response(stream, { headers });
  } catch {
    return new Response("Storage unavailable", { status: 502 });
  }
}
