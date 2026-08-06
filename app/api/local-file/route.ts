import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { getFilesForUser } from "@/lib/telegram-store";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return new NextResponse("Missing id", { status: 400 });

  // Verify the file belongs to the user
  const files = await getFilesForUser(user.id);
  const fileInfo = files.find(f => f.telegramFileId === `local:${id}`);
  if (!fileInfo) return new NextResponse("Forbidden", { status: 403 });

  const filePath = path.join(process.cwd(), ".data", "files", id);
  try {
    const content = await readFile(filePath);
    return new NextResponse(content, {
      headers: {
        "Content-Type": fileInfo.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileInfo.name}"`,
      },
    });
  } catch (error) {
    return new NextResponse("File not found", { status: 404 });
  }
}
