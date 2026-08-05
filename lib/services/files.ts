import { db } from "@/lib/db";
import { logActivity } from "@/lib/services/activity";
import { getOwnedFolder } from "@/lib/services/folders";
import { getUser } from "@/lib/services/users";
import { removeFile } from "@/lib/storage";

export interface FileRow {
  id: number;
  user_id: string;
  folder_id: number | null;
  name: string;
  mime: string | null;
  size_bytes: number;
  is_image: number;
  is_video: number;
  storage_ref: string;
  preview_ref: string | null;
  chunk_info: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type FileSort = "newest" | "oldest" | "name" | "size";

export interface ListFilesOptions {
  userId: string;
  folderId?: number | null;
  search?: string;
  type?: "image" | "video" | "all";
  sort?: FileSort;
}

const SORT_SQL: Record<FileSort, string> = {
  newest: "created_at DESC, id DESC",
  oldest: "created_at ASC, id ASC",
  name: "name COLLATE NOCASE ASC",
  size: "size_bytes DESC",
};

export function recalcUserUsage(userId: string) {
  const row = db()
    .prepare(
      "SELECT COALESCE(SUM(size_bytes),0) AS used FROM files WHERE user_id=? AND deleted_at IS NULL",
    )
    .get(userId) as { used: number };
  db().prepare("UPDATE users SET storage_used_bytes=? WHERE id=?").run(row.used, userId);
  return row.used;
}

export function createFile(
  userId: string,
  input: {
    name: string;
    mime?: string | null;
    sizeBytes: number;
    folderId?: number | null;
    storageRef: string;
    previewRef?: string | null;
    chunkInfo?: string | null;
  },
): FileRow {
  if (input.folderId) getOwnedFolder(userId, input.folderId);
  const isImage = input.mime?.startsWith("image/") ? 1 : 0;
  const isVideo = input.mime?.startsWith("video/") ? 1 : 0;
  const res = db()
    .prepare(
      `INSERT INTO files
        (user_id, folder_id, name, mime, size_bytes, is_image, is_video,
         storage_ref, preview_ref, chunk_info)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      input.folderId ?? null,
      input.name,
      input.mime ?? null,
      input.sizeBytes,
      isImage,
      isVideo,
      input.storageRef,
      input.previewRef ?? null,
      input.chunkInfo ?? null,
    );
  recalcUserUsage(userId);
  logActivity(userId, "file.uploaded", `Uploaded “${input.name}”`, {
    size: input.sizeBytes,
  });
  return db()
    .prepare("SELECT * FROM files WHERE id=?")
    .get(res.lastInsertRowid as number) as FileRow;
}

export function getOwnedFile(
  userId: string,
  fileId: number,
  includeDeleted = false,
): FileRow {
  const row = db()
    .prepare("SELECT * FROM files WHERE id=? AND user_id=?")
    .get(fileId, userId) as FileRow | undefined;
  if (!row) throw new Error("File not found");
  if (!includeDeleted && row.deleted_at) throw new Error("File not found");
  return row;
}

export function listFiles(opts: ListFilesOptions): FileRow[] {
  const where: string[] = ["user_id = ?", "deleted_at IS NULL"];
  const params: unknown[] = [opts.userId];
  if (opts.folderId !== undefined) {
    if (opts.folderId === null) {
      where.push("folder_id IS NULL");
    } else {
      where.push("folder_id = ?");
      params.push(opts.folderId);
    }
  }
  if (opts.search) {
    where.push("name LIKE ?");
    params.push(`%${opts.search}%`);
  }
  if (opts.type === "image") where.push("is_image = 1");
  if (opts.type === "video") where.push("is_video = 1");
  const sort = SORT_SQL[opts.sort ?? "newest"];
  return db()
    .prepare(
      `SELECT * FROM files WHERE ${where.join(" AND ")} ORDER BY ${sort}`,
    )
    .all(...params) as FileRow[];
}

export function renameFile(userId: string, fileId: number, name: string) {
  if (!name.trim()) throw new Error("File name is required");
  const f = getOwnedFile(userId, fileId);
  db()
    .prepare("UPDATE files SET name=?, updated_at=datetime('now') WHERE id=?")
    .run(name.trim(), f.id);
  logActivity(userId, "file.renamed", `Renamed “${f.name}” to “${name.trim()}”`);
}

export function moveFile(
  userId: string,
  fileId: number,
  folderId: number | null,
) {
  const f = getOwnedFile(userId, fileId);
  if (folderId) getOwnedFolder(userId, folderId);
  db()
    .prepare("UPDATE files SET folder_id=?, updated_at=datetime('now') WHERE id=?")
    .run(folderId, f.id);
  logActivity(userId, "file.moved", `Moved “${f.name}”`);
}

export function softDeleteFile(userId: string, fileId: number) {
  const f = getOwnedFile(userId, fileId);
  db()
    .prepare("UPDATE files SET deleted_at=datetime('now'), updated_at=datetime('now') WHERE id=?")
    .run(f.id);
  recalcUserUsage(userId);
  logActivity(userId, "file.deleted", `Moved “${f.name}” to Recycle Bin`);
}

export function restoreFile(userId: string, fileId: number) {
  const f = getOwnedFile(userId, fileId, true);
  db()
    .prepare("UPDATE files SET deleted_at=NULL, updated_at=datetime('now') WHERE id=?")
    .run(f.id);
  recalcUserUsage(userId);
  logActivity(userId, "file.restored", `Restored “${f.name}”`);
}

export async function permanentDeleteFile(userId: string, fileId: number) {
  const f = getOwnedFile(userId, fileId, true);
  const owner = getUser(userId);
  try {
    await removeFile(f.storage_ref, owner);
  } catch {
    // Storage cleanup is best-effort; remove the metadata regardless.
  }
  db().prepare("DELETE FROM files WHERE id=?").run(f.id);
  recalcUserUsage(userId);
  logActivity(userId, "file.deleted_permanent", `Permanently deleted “${f.name}”`);
}

export function listTrashedFiles(userId: string): FileRow[] {
  return db()
    .prepare(
      "SELECT * FROM files WHERE user_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    )
    .all(userId) as FileRow[];
}

export async function emptyTrash(userId: string) {
  const trashed = listTrashedFiles(userId);
  const owner = getUser(userId);
  for (const f of trashed) {
    try {
      await removeFile(f.storage_ref, owner);
    } catch {
      /* best effort */
    }
  }
  db().prepare("DELETE FROM files WHERE user_id=? AND deleted_at IS NOT NULL").run(userId);
  db().prepare("DELETE FROM folders WHERE user_id=? AND deleted_at IS NOT NULL").run(userId);
  recalcUserUsage(userId);
  logActivity(userId, "trash.emptied", "Recycle Bin emptied");
}

export function parseFileType(mime: string | null): "image" | "video" | "other" {
  if (!mime) return "other";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "other";
}
