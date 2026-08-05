import { mkdirSync, accessSync, constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "@/lib/config";

let _writableDir: string | null = null;

/**
 * Resolves a directory the app can actually write to, used for the SQLite
 * metadata database and the local storage backend.
 *
 * On serverless hosts (e.g. Vercel) the project filesystem is read-only except
 * /tmp, so writing the sqlite file to the default `data/` dir throws
 * "unable to open database file". That failure surfaces as the dashboard's
 * "Unable to load account" screen because account creation (inserting the user
 * row) needs the database.
 *
 * We fall back to a writable temp dir so the app can boot and serve requests
 * instead of hard-crashing. NOTE: a temp dir is ephemeral (per function
 * instance), so for durable metadata on a serverless host you should use a
 * persistent backend behind the Storage Manager / a hosted database. See
 * SETUP.md.
 */
export function writableDataDir(): string {
  if (_writableDir) return _writableDir;
  const preferred = config.dataDir || "data";

  if (isWritable(preferred)) {
    _writableDir = preferred;
    return _writableDir;
  }

  const fallback = path.join(os.tmpdir(), "tellybase");
  console.warn(
    `[tellybase] Data directory "${preferred}" is not writable ` +
      `(read-only serverless filesystem?). Falling back to "${fallback}". ` +
      `This directory is ephemeral — for durable metadata on a serverless host ` +
      `use a persistent backend (e.g. the Telegram storage backend or a hosted database).`,
  );
  mkdirSync(fallback, { recursive: true });
  _writableDir = fallback;
  return _writableDir;
}

function isWritable(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
