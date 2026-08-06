import "server-only";

// Lightweight per-process cache for expensive Telegram reads.
// Provides: TTL, LRU, request coalescing (pending map), and ETag generation.
// Safe for serverless (per-instance) — drastically cuts Telegram API calls
// for polling gallery (search + pagination) without needing Redis.

import { createHash } from "node:crypto";

type CacheEntry<T> = { value: T; expiresAt: number; etag: string };

const cache = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 500;

function evictIfNeeded() {
  if (cache.size <= MAX_ENTRIES) return;
  // Delete oldest (Map ordered)
  const toDelete = cache.size - MAX_ENTRIES;
  let i = 0;
  for (const k of cache.keys()) {
    if (i++ >= toDelete) break;
    cache.delete(k);
  }
}

function makeEtag(payload: unknown): string {
  const h = createHash("sha1");
  h.update(JSON.stringify(payload));
  return `"${h.digest("hex").slice(0, 16)}"`;
}

export function getCache<T>(key: string): { value: T; etag: string } | null {
  const e = cache.get(key) as CacheEntry<T> | undefined;
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    cache.delete(key);
    return null;
  }
  // Touch for LRU
  cache.delete(key);
  cache.set(key, e);
  return { value: e.value, etag: e.etag };
}

export function setCache<T>(key: string, value: T, ttlMs: number): string {
  const etag = makeEtag(value);
  const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs, etag };
  cache.set(key, entry);
  evictIfNeeded();
  return etag;
}

export function invalidatePrefix(prefix: string) {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
  for (const k of pending.keys()) if (k.startsWith(prefix)) pending.delete(k);
}

// Deduplicate concurrent fetches for same key
export async function cachedFetch<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<{ value: T; etag: string; hit: boolean }> {
  const cached = getCache<T>(key);
  if (cached) return { value: cached.value, etag: cached.etag, hit: true };

  const p = pending.get(key) as Promise<T> | undefined;
  if (p) {
    const v = await p;
    const etag = makeEtag(v);
    return { value: v, etag, hit: false };
  }

  const promise = fn().finally(() => pending.delete(key));
  pending.set(key, promise);
  const value = await promise;
  const etag = setCache(key, value, ttlMs);
  return { value, etag, hit: false };
}

export function etagMatches(reqEtag: string | null, currentEtag: string): boolean {
  if (!reqEtag) return false;
  // Handle `If-None-Match: "abc", "def"` or W/ prefix
  const parts = reqEtag.split(",").map((s) => s.trim().replace(/^W\//, ""));
  return parts.includes(currentEtag) || parts.includes("*");
}
