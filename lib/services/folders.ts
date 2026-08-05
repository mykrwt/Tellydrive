import { db } from "@/lib/db";
import { logActivity } from "@/lib/services/activity";

export interface FolderRow {
  id: number;
  user_id: string;
  parent_id: number | null;
  name: string;
  storage_ref: string | null;
  deleted_at: string | null;
  created_at: string;
}

export function createFolder(
  userId: string,
  name: string,
  parentId: number | null = null,
): FolderRow {
  if (!name.trim()) throw new Error("Folder name is required");
  const existing = db()
    .prepare(
      "SELECT id FROM folders WHERE user_id=? AND parent_id IS ? AND name=? AND deleted_at IS NULL",
    )
    .get(userId, parentId, name.trim());
  if (existing) throw new Error("A folder with that name already exists here");
  const res = db()
    .prepare(
      "INSERT INTO folders (user_id, parent_id, name) VALUES (?, ?, ?)",
    )
    .run(userId, parentId, name.trim());
  logActivity(userId, "folder.created", `Created folder “${name.trim()}”`);
  return db()
    .prepare("SELECT * FROM folders WHERE id=?")
    .get(res.lastInsertRowid as number) as FolderRow;
}

export function renameFolder(userId: string, folderId: number, name: string) {
  if (!name.trim()) throw new Error("Folder name is required");
  const f = getOwnedFolder(userId, folderId);
  db().prepare("UPDATE folders SET name=? WHERE id=?").run(name.trim(), f.id);
  logActivity(userId, "folder.renamed", `Renamed folder to “${name.trim()}”`);
}

export function moveFolder(
  userId: string,
  folderId: number,
  newParentId: number | null,
) {
  const f = getOwnedFolder(userId, folderId);
  if (newParentId === f.id) throw new Error("Cannot move a folder into itself");
  if (newParentId) {
    // Prevent cycles.
    let cursor: number | null = newParentId;
    let guard = 0;
    while (cursor !== null) {
      if (cursor === f.id) throw new Error("Cannot move a folder into its own subtree");
      const parent = db()
        .prepare("SELECT parent_id FROM folders WHERE id=? AND user_id=?")
        .get(cursor, userId) as { parent_id: number | null } | undefined;
      const next = parent?.parent_id ?? null;
      if (next === null) break;
      cursor = next;
      if (++guard > 100) break;
    }
  }
  db()
    .prepare("UPDATE folders SET parent_id=? WHERE id=?")
    .run(newParentId, f.id);
  logActivity(userId, "folder.moved", `Moved folder “${f.name}”`);
}

export function getOwnedFolder(
  userId: string,
  folderId: number,
  includeDeleted = false,
): FolderRow {
  const row = db()
    .prepare("SELECT * FROM folders WHERE id=? AND user_id=?")
    .get(folderId, userId) as FolderRow | undefined;
  if (!row) throw new Error("Folder not found");
  if (!includeDeleted && row.deleted_at) throw new Error("Folder not found");
  return row;
}

export function listRootFolders(userId: string): FolderRow[] {
  return db()
    .prepare(
      "SELECT * FROM folders WHERE user_id=? AND parent_id IS NULL AND deleted_at IS NULL ORDER BY name",
    )
    .all(userId) as FolderRow[];
}

export function listSubfolders(userId: string, parentId: number | null): FolderRow[] {
  if (parentId === null) return listRootFolders(userId);
  return db()
    .prepare(
      "SELECT * FROM folders WHERE user_id=? AND parent_id=? AND deleted_at IS NULL ORDER BY name",
    )
    .all(userId, parentId) as FolderRow[];
}

export interface FolderNode extends FolderRow {
  children: FolderNode[];
  file_count: number;
}

export function buildFolderTree(userId: string): FolderNode[] {
  const rows = db()
    .prepare(
      "SELECT * FROM folders WHERE user_id=? AND deleted_at IS NULL ORDER BY name",
    )
    .all(userId) as FolderRow[];
  const fileCounts = db()
    .prepare(
      "SELECT folder_id, COUNT(*) AS c FROM files WHERE user_id=? AND deleted_at IS NULL AND folder_id IS NOT NULL GROUP BY folder_id",
    )
    .all(userId) as { folder_id: number; c: number }[];
  const counts = new Map(fileCounts.map((f) => [f.folder_id, f.c]));
  const map = new Map<number, FolderNode>();
  const roots: FolderNode[] = [];
  for (const r of rows) {
    map.set(r.id, { ...r, children: [], file_count: counts.get(r.id) ?? 0 });
  }
  for (const node of map.values()) {
    const parent = node.parent_id ? map.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function softDeleteFolder(userId: string, folderId: number) {
  const f = getOwnedFolder(userId, folderId);
  const mark = (id: number) => {
    db().prepare("UPDATE folders SET deleted_at=datetime('now') WHERE id=?").run(id);
    db().prepare("UPDATE files SET deleted_at=datetime('now') WHERE folder_id=?").run(id);
    const subs = db()
      .prepare("SELECT id FROM folders WHERE parent_id=? AND deleted_at IS NULL")
      .all(id) as { id: number }[];
    for (const s of subs) mark(s.id);
  };
  mark(f.id);
  logActivity(userId, "folder.deleted", `Moved folder “${f.name}” to Recycle Bin`);
}

export function restoreFolder(userId: string, folderId: number) {
  const f = getOwnedFolder(userId, folderId, true);
  const restore = (id: number) => {
    db().prepare("UPDATE folders SET deleted_at=NULL WHERE id=?").run(id);
    db().prepare("UPDATE files SET deleted_at=NULL WHERE folder_id=?").run(id);
    const subs = db()
      .prepare("SELECT id FROM folders WHERE parent_id=?")
      .all(id) as { id: number }[];
    for (const s of subs) restore(s.id);
  };
  restore(f.id);
  logActivity(userId, "folder.restored", `Restored folder “${f.name}”`);
}

export function listTrashedFolders(userId: string): FolderRow[] {
  return db()
    .prepare(
      "SELECT * FROM folders WHERE user_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    )
    .all(userId) as FolderRow[];
}

export function permanentlyDeleteFolder(userId: string, folderId: number) {
  const f = getOwnedFolder(userId, folderId, true);
  db().prepare("DELETE FROM files WHERE folder_id=?").run(f.id);
  db().prepare("DELETE FROM folders WHERE id=?").run(f.id);
  logActivity(userId, "folder.deleted_permanent", `Permanently deleted folder “${f.name}”`);
}

export function folderPath(userId: string, folderId: number | null): string[] {
  const names: string[] = [];
  let cursor = folderId;
  let guard = 0;
  while (cursor) {
    const f = db()
      .prepare("SELECT id, parent_id, name FROM folders WHERE id=? AND user_id=?")
      .get(cursor, userId) as { id: number; parent_id: number | null; name: string } | undefined;
    if (!f) break;
    names.unshift(f.name);
    cursor = f.parent_id ?? null;
    if (++guard > 100) break;
  }
  return names;
}
