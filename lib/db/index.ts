import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { config } from "@/lib/config";
import { writableDataDir } from "@/lib/data-dir";
import { restoreDbSync, flushDbSync } from "@/lib/telegram-db";

// ---------------------------------------------------------------------------
// SQLite metadata database. This stores the app's business data (users,
// folders, files, plans, activity, settings). The Storage Manager is the only
// place that talks to the storage backend (Telegram / disk) — the database
// keeps references (telegram file ids / local paths) but never stores bytes.
//
// Durability: on serverless hosts the filesystem is ephemeral, so the sqlite
// file is also mirrored to Telegram (lib/telegram-db). On cold start we restore
// the latest copy; after every write we checkpoint and upload it back. When
// Telegram isn't configured we simply use the local file (dev fallback).
// ---------------------------------------------------------------------------

let _raw: DatabaseSync | null = null;
let _db: DatabaseSync | null = null;

export type DB = DatabaseSync;

export function db(): DatabaseSync {
  if (_db) return _db;
  const dir = writableDataDir();
  const dbPath = path.join(dir, "tellybase.db");

  const status = restoreDbSync(dbPath);
  _raw = new DatabaseSync(dbPath);
  _raw.exec("PRAGMA journal_mode = WAL;");
  _raw.exec("PRAGMA foreign_keys = ON;");
  migrate(_raw);
  seed(_raw);

  if (status === "fresh") {
    // A brand-new database was just created: upload it once so future cold
    // starts have something to restore.
    checkpoint();
    flushDbSync(dbPath);
  }

  if (status === "restored" || status === "fresh") {
    // Wrap the connection so every write is checkpointed and mirrored to
    // Telegram. On "skipped" (no Telegram configured) we use the raw local DB.
    _db = watchForWrites(_raw, () => {
      checkpoint();
      flushDbSync(dbPath);
    });
  } else {
    _db = _raw;
  }
  return _db;
}

function checkpoint(): void {
  try {
    _raw?.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
  } catch (e) {
    console.warn("[db] wal checkpoint failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * Returns a Proxy over the raw DatabaseSync that mirrors every write to the
 * Telegram-backed store. Writes are detected via total_changes() (which counts
 * rows changed since the connection opened), covering both prepare().run() and
 * exec() without needing to inspect every statement.
 */
function watchForWrites(db: DatabaseSync, onWrite: () => void): DatabaseSync {
  const changes = () =>
    (db.prepare("SELECT total_changes() AS c").get() as { c: number }).c;

  const wrapStatement = (stmt: any): any =>
    new Proxy(stmt, {
      get(target, prop) {
        if (prop === "run") {
          return (...params: unknown[]) => {
            const res = target.run(...params);
            if (res && typeof res.changes === "number" && res.changes > 0) {
              onWrite();
            }
            return res;
          };
        }
        const value = (target as any)[prop];
        if (typeof value === "function") return value.bind(target);
        return value;
      },
    });

  return new Proxy(db, {
    get(target, prop) {
      if (prop === "prepare") {
        return (sql: string) => wrapStatement(target.prepare(sql));
      }
      if (prop === "exec") {
        return (sql: string) => {
          const before = changes();
          const res = target.exec(sql);
          if (changes() !== before) onWrite();
          return res;
        };
      }
      const value = (target as any)[prop];
      if (typeof value === "function") return value.bind(target);
      return value;
    },
  });
}

function migrate(d: DatabaseSync) {
  d.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    price_monthly REAL NOT NULL DEFAULT 0,
    storage_bytes INTEGER NOT NULL DEFAULT 0,
    max_upload_bytes INTEGER NOT NULL DEFAULT 0,
    features TEXT NOT NULL DEFAULT '[]',
    is_default INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,            -- Clerk user id
    email TEXT,
    name TEXT,
    image_url TEXT,
    plan_id INTEGER NOT NULL DEFAULT 1,
    storage_used_bytes INTEGER NOT NULL DEFAULT 0,
    is_suspended INTEGER NOT NULL DEFAULT 0,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_at TEXT,
    FOREIGN KEY(plan_id) REFERENCES plans(id)
  );

  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    parent_id INTEGER,
    name TEXT NOT NULL,
    storage_ref TEXT,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(parent_id) REFERENCES folders(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    folder_id INTEGER,
    name TEXT NOT NULL,
    mime TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    is_image INTEGER NOT NULL DEFAULT 0,
    is_video INTEGER NOT NULL DEFAULT 0,
    storage_ref TEXT NOT NULL,
    preview_ref TEXT,
    chunk_info TEXT,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    detail TEXT,
    meta TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id, deleted_at);
  CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
  CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id, deleted_at);
  CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id, created_at);
  `);
}

function seed(d: DatabaseSync) {
  const count = d
    .prepare("SELECT COUNT(*) AS c FROM plans")
    .get() as { c: number };
  if (count.c > 0) return;

  const insert = d.prepare(
    `INSERT INTO plans
       (name, price_monthly, storage_bytes, max_upload_bytes, features, is_default, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const GB = 1024 * 1024 * 1024;
  insert.run("Free", 0, 10 * GB, 2 * GB, JSON.stringify(["Images & video uploads", "Folders & simple search", "Secure account access"]), 1, 0);
  insert.run("Starter", 199, 100 * GB, 5 * GB, JSON.stringify(["Everything in Free", "100 GB storage", "Faster uploads", "Activity history"]), 0, 1);
  insert.run("Pro", 499, 1000 * GB, 10 * GB, JSON.stringify(["Everything in Starter", "1 TB storage", "Priority support", "Advanced analytics"]), 0, 2);

  const adminIds = JSON.stringify(config.adminUserIds);
  d.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('maintenance_mode','0')").run();
  d.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('recycle_retention_days', ?)").run(String(config.recycleRetentionDays));
  d.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_user_ids', ?)").run(adminIds);
}
