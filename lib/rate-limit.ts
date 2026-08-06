import "server-only";

// Simple in-memory rate limiter. For production, replace with Redis/Upstash.
// Keyed by userId + endpoint or IP + endpoint, sliding window.

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

// Cleanup every 5 minutes
let lastCleanup = Date.now();
function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 5 * 60 * 1000) return;
  lastCleanup = now;
  for (const [k, v] of store) {
    if (v.resetAt < now) store.delete(k);
  }
}

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number; resetAt: number } {
  maybeCleanup();
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }
  if (entry.count < limit) {
    entry.count += 1;
    return { ok: true, remaining: limit - entry.count, resetAt: entry.resetAt };
  }
  return { ok: false, remaining: 0, resetAt: entry.resetAt };
}

// Presets
export const limits = {
  upload: { limit: 30, windowMs: 60_000 }, // 30 uploads/min
  // Large files arrive as many small parts (Vercel body-limit workaround);
  // a 2 GB file is ~512 parts, so this budget must be generous.
  uploadPart: { limit: 2000, windowMs: 60_000 },
  list: { limit: 120, windowMs: 60_000 }, // 120 list/min
  download: { limit: 120, windowMs: 60_000 },
  delete: { limit: 60, windowMs: 60_000 },
  auth: { limit: 10, windowMs: 10 * 60_000 }, // 10 auth attempts / 10 min per IP
  authStrict: { limit: 5, windowMs: 15 * 60_000 }, // 5 per 15 min per IP+email
};

export function checkRateLimit(userId: string, endpoint: keyof typeof limits) {
  const cfg = limits[endpoint];
  const result = rateLimit(`${userId}:${endpoint}`, cfg.limit, cfg.windowMs);
  if (!result.ok) {
    const err = new Error(`Too many requests. Try again soon.`) as Error & { status?: number; resetAt?: number };
    err.status = 429;
    (err as unknown as { resetAt: number }).resetAt = result.resetAt;
    throw err;
  }
  return result;
}

export function checkIpRateLimit(ip: string, endpoint: keyof typeof limits) {
  const cfg = limits[endpoint];
  const result = rateLimit(`ip:${ip}:${endpoint}`, cfg.limit, cfg.windowMs);
  if (!result.ok) {
    const err = new Error(`Too many requests. Try again soon.`) as Error & { status?: number; resetAt?: number };
    err.status = 429;
    (err as unknown as { resetAt: number }).resetAt = result.resetAt;
    throw err;
  }
  return result;
}

export function getRetryAfterSec(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}
