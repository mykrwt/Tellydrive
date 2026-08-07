import "server-only";

// Production-ready in-memory rate limiter with LRU eviction, sliding-window,
// burst handling and rich headers. For multi-instance / serverless, swap with
// Redis (Upstash) — interface is compatible.
//
// Keys: `user:${userId}:${endpoint}` or `ip:${ip}:${endpoint}`
// Each entry keeps a circular buffer of timestamps for precise sliding window.

type Entry = { timestamps: number[]; resetAt: number };
const store = new Map<string, Entry>();
const MAX_KEYS = 8000; // LRU cap

let lastCleanup = Date.now();
function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  // Evict expired
  for (const [k, v] of store) {
    // If oldest timestamp + window is in the past and resetAt expired, delete
    if (v.resetAt < now && v.timestamps.every((t) => now - t > 60_000)) {
      store.delete(k);
    }
  }
  // Hard cap: delete oldest entries (Map preserves insertion order)
  if (store.size > MAX_KEYS) {
    const toDelete = store.size - MAX_KEYS;
    let i = 0;
    for (const k of store.keys()) {
      if (i++ >= toDelete) break;
      store.delete(k);
    }
  }
}

function touchKey(key: string, entry: Entry) {
  // Move to end for LRU
  store.delete(key);
  store.set(key, entry);
}

export type RateResult = { ok: boolean; remaining: number; resetAt: number; limit: number; windowMs: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  maybeCleanup();
  const now = Date.now();
  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [now], resetAt: now + windowMs };
    store.set(key, entry);
    return { ok: true, remaining: limit - 1, resetAt: entry.resetAt, limit, windowMs };
  }
  touchKey(key, entry);
  // Evict timestamps outside window
  const cutoff = now - windowMs;
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length < limit) {
    entry.timestamps.push(now);
    // Keep resetAt as last timestamp + window, but not earlier than now
    entry.resetAt = entry.timestamps[0] + windowMs;
    const remaining = limit - entry.timestamps.length;
    return { ok: true, remaining, resetAt: entry.resetAt, limit, windowMs };
  }
  // Over limit: resetAt is oldest + window
  const resetAt = entry.timestamps[0] + windowMs;
  return { ok: false, remaining: 0, resetAt, limit, windowMs };
}

// Helper to build standard rate-limit headers
export function rateLimitHeaders(r: RateResult): Record<string, string> {
  const resetSec = Math.ceil(r.resetAt / 1000);
  const retryAfter = Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000));
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(resetSec),
    "Retry-After": String(retryAfter),
  };
}

// Presets — tuned for snappy UX while protecting Telegram/backend
export const limits = {
  // Gallery list: 60/min per user, generous because scroll + search + sort
  list: { limit: 90, windowMs: 60_000 },
  // Download/stream: 90/min per user, 60/min per IP fallback
  download: { limit: 90, windowMs: 60_000 },
  downloadIp: { limit: 60, windowMs: 60_000 },
  // Metadata, thumbnail and preview reads: generous so media grids/tiles
  // render without tripping the download fuse (they stream no bytes here)
  preview: { limit: 300, windowMs: 60_000 },
  // Single-shot upload (≤4 MB): 20/min per user
  upload: { limit: 20, windowMs: 60_000 },
  // Chunk parts: 800/min per user (~3 GB/min), burst-tolerant
  uploadPart: { limit: 800, windowMs: 60_000 },
  // Delete: 40/min
  delete: { limit: 40, windowMs: 60_000 },
  // Folder operations (create/rename/move/delete): 60/min
  folder: { limit: 60, windowMs: 60_000 },
  // Auth: 8/min per IP, stricter per IP+email
  auth: { limit: 8, windowMs: 10 * 60_000 },
  authStrict: { limit: 5, windowMs: 15 * 60_000 },
  // Privileged administrative reads/writes always have backend rate limits.
  adminRead: { limit: 60, windowMs: 60_000 },
  adminWrite: { limit: 20, windowMs: 60_000 },
  // Admin-console bot updates (per authorized Telegram account): button
  // browsing of lists/pages is chatty, so this is more generous than adminWrite
  // but still bounds abuse of the private gateway.
  adminBot: { limit: 90, windowMs: 60_000 },
  // Global API fallback per IP: 200/min
  apiIp: { limit: 200, windowMs: 60_000 },
};

export function checkRateLimit(userId: string, endpoint: keyof typeof limits) {
  const cfg = limits[endpoint];
  const result = rateLimit(`user:${userId}:${endpoint}`, cfg.limit, cfg.windowMs);
  if (!result.ok) {
    const err = new Error(`Too many requests. Try again soon.`) as Error & { status?: number; resetAt?: number; result?: RateResult };
    err.status = 429;
    (err as unknown as { resetAt: number }).resetAt = result.resetAt;
    (err as unknown as { result: RateResult }).result = result;
    throw err;
  }
  return result;
}

export function checkIpRateLimit(ip: string, endpoint: keyof typeof limits) {
  const cfg = limits[endpoint];
  const result = rateLimit(`ip:${ip}:${endpoint}`, cfg.limit, cfg.windowMs);
  if (!result.ok) {
    const err = new Error(`Too many requests. Try again soon.`) as Error & { status?: number; resetAt?: number; result?: RateResult };
    err.status = 429;
    (err as unknown as { resetAt: number }).resetAt = result.resetAt;
    (err as unknown as { result: RateResult }).result = result;
    throw err;
  }
  return result;
}

// Convenience: check both user and IP (IP as burst fuse)
export function checkRateLimitWithIp(userId: string, ip: string, endpoint: keyof typeof limits) {
  const userRes = checkRateLimit(userId, endpoint);
  // Secondary IP fuse for sensitive endpoints (upload/delete/download)
  if (["upload", "uploadPart", "delete", "download"].includes(endpoint)) {
    const ipKey = endpoint === "download" ? "downloadIp" : endpoint as keyof typeof limits;
    try {
      checkIpRateLimit(ip, ipKey);
    } catch (e) {
      // Prefer user limit error if both exceed, else throw IP limit
      throw e;
    }
  }
  return userRes;
}

export function getRetryAfterSec(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}

// For middleware: cheap check without throwing, returns headers
export function peekRateLimit(key: string, limit: number, windowMs: number): RateResult {
  maybeCleanup();
  const entry = store.get(key);
  if (!entry) return { ok: true, remaining: limit, resetAt: Date.now() + windowMs, limit, windowMs };
  const now = Date.now();
  const valid = entry.timestamps.filter((t) => t > now - windowMs);
  const remaining = Math.max(0, limit - valid.length);
  const resetAt = valid[0] ? valid[0] + windowMs : now + windowMs;
  return { ok: remaining > 0, remaining, resetAt, limit, windowMs };
}
