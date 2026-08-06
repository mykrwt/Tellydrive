import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { findUserById, getFilesForUser, getFoldersForUser } from "@/lib/telegram-store";
import { isAdminUser } from "@/lib/admin";
import { DashboardNav } from "@/components/dashboard-nav";
import { FileManager } from "@/components/file-manager";

export const metadata = { title: "Files" };

export default async function FilesPage() {
  let safeUser;
  try {
    safeUser = await getCurrentUser();
  } catch {
    redirect("/sign-in?error=store");
  }
  if (!safeUser) redirect("/sign-in");

  const user = await findUserById(safeUser.id);
  if (!user) redirect("/sign-in");

  // Root folder listing (server-rendered so the first paint has content)
  const [folders, files] = await Promise.all([
    getFoldersForUser(user.id, null),
    getFilesForUser(user.id, { folderId: null, sortBy: "name", sortOrder: "asc", limit: 500 }),
  ]);

  const safeFolders = folders
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, createdAt: f.createdAt }));

  const safeFiles = files.map((f) => ({
    id: f.id,
    name: f.name,
    size: f.size,
    mimeType: f.mimeType,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    chunked: f.chunked,
    chunkCount: f.chunkCount,
    folderId: f.folderId,
    hasThumbnail: Boolean(f.thumbnailFileId),
  }));

  return (
    <main className="dashboard-page gallery-page">
      <DashboardNav userName={user.name} isAdmin={isAdminUser(user)} />
      <section className="gallery-shell">
        <FileManager initialFolders={safeFolders} initialFiles={safeFiles} initialPath={[]} />
      </section>
    </main>
  );
}
