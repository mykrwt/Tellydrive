import { redirect } from "next/navigation";
import { authorizeRequest } from "@/lib/backend-authority";
import { findUserById, getFilesForUser, getFolderById, getFolderPath, getFoldersForUser } from "@/lib/telegram-store";
import { isAdminUser } from "@/lib/admin";
import { FileManager } from "@/components/file-manager";
import { DashboardChrome } from "@/components/dashboard-chrome";
import { getDashboardSummary } from "@/lib/dashboard-summary";

export const metadata = { title: "Files" };

const FOLDER_ID_RE = /^[a-zA-Z0-9_-]{6,64}$/;

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; folder?: string }>;
}) {
  let safeUser;
  try {
    safeUser = (await authorizeRequest("storage:read")).user;
  } catch (error) {
    const status = (error as { status?: number }).status;
    redirect(status === 401 ? "/sign-in" : "/sign-in?error=access");
  }

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 120) : "";
  const requestedFolderId = typeof params.folder === "string" && FOLDER_ID_RE.test(params.folder) ? params.folder : null;

  const user = await findUserById(safeUser.id);
  if (!user) redirect("/sign-in");

  const activeFolder = requestedFolderId ? await getFolderById(user.id, requestedFolderId) : null;
  const folderId = activeFolder?.id ?? null;

  const [folders, files, allFolders, allFiles, path, summary] = await Promise.all([
    getFoldersForUser(user.id, folderId),
    getFilesForUser(user.id, { folderId, section: "files", sortBy: "name", sortOrder: "asc", limit: 500 }),
    getFoldersForUser(user.id),
    getFilesForUser(user.id, { section: "files" }),
    folderId ? getFolderPath(user.id, folderId) : Promise.resolve([]),
    getDashboardSummary(user.id),
  ]);

  const itemCounts = new Map<string, number>();
  for (const file of allFiles) {
    if (file.folderId) itemCounts.set(file.folderId, (itemCounts.get(file.folderId) ?? 0) + 1);
  }
  for (const folder of allFolders) {
    if (folder.parentId) itemCounts.set(folder.parentId, (itemCounts.get(folder.parentId) ?? 0) + 1);
  }

  const safeFolders = folders
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      createdAt: folder.createdAt,
      itemCount: itemCounts.get(folder.id) ?? 0,
    }));

  const safeFiles = files.map((file) => ({
    id: file.id,
    name: file.name,
    size: file.size,
    mimeType: file.mimeType,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    chunked: file.chunked,
    chunkCount: file.chunkCount,
    folderId: file.folderId,
    hasThumbnail: Boolean(file.thumbnailFileId),
  }));

  return (
    <DashboardChrome user={{ name: user.name, email: user.email, isAdmin: isAdminUser(user) }} summary={summary}>
      <FileManager
        initialFolders={safeFolders}
        initialFiles={safeFiles}
        initialPath={path}
        initialSearch={search}
        summary={summary}
      />
    </DashboardChrome>
  );
}
