import "server-only";

import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import {
  createUser,
  findUserByEmail,
  findUserById,
  markLogin,
  type StoredUser,
} from "@/lib/telegram-store";

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "tellybase_session";

type SessionPayload = { sub: string; exp: number };
export type SafeUser = Pick<StoredUser, "id" | "name" | "email" | "createdAt" | "lastLoginAt">;

function safeUser(user: StoredUser): SafeUser {
  const { id, name, email, createdAt, lastLoginAt } = user;
  return { id, name, email, createdAt, lastLoginAt };
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateEmail(value: string): boolean {
  // Use regex whitespace/dot tokens (not literal backslashes). The previous
  // expression treated `s` and `\` as invalid email characters, rejecting
  // otherwise valid addresses such as `sarah@example.com`.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export function validatePassword(value: string): string | null {
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (value.length > 128) return "Password must be 128 characters or fewer.";
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return "Password must include a letter and a number.";
  }
  return null;
}

async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString("base64url");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return { hash: derived.toString("base64url"), salt };
}

async function verifyPassword(password: string, salt: string, expected: string): Promise<boolean> {
  try {
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    const expectedBuffer = Buffer.from(expected, "base64url");
    return derived.length === expectedBuffer.length && timingSafeEqual(derived, expectedBuffer);
  } catch {
    return false;
  }
}

function sessionSecret(): string {
  const secret =
    process.env.SESSION_SECRET ||
    process.env.TELEGRAM_BOT_TOKEN ||
    (process.env.NODE_ENV !== "production" ? "tellybase-local-development-session-key" : "");
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not configured — set a strong random value (openssl rand -base64 32).");
  }
  if (secret && secret.length < 16 && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET too short — use at least 16 characters.");
  }
  return secret;
}

function sign(value: string): string {
  const secret = sessionSecret();
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function encodeSession(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function decodeSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  try {
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) return null;
    const actual = Buffer.from(signature, "base64url");
    const expected = Buffer.from(sign(encoded), "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    // Reject implausible exp (over 60 days)
    if (payload.exp > Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60) return null;
    return payload;
  } catch {
    return null;
  }
}

// --- Brute-force protection (in-memory, per-IP + per-email) ---
type AttemptEntry = { count: number; resetAt: number; lockedUntil?: number };
const loginAttempts = new Map<string, AttemptEntry>();
const CLEAN_INTERVAL = 5 * 60 * 1000;
let lastClean = Date.now();
function cleanupAttempts() {
  const now = Date.now();
  if (now - lastClean < CLEAN_INTERVAL) return;
  lastClean = now;
  for (const [k, v] of loginAttempts) {
    if (v.resetAt < now && (!v.lockedUntil || v.lockedUntil < now)) loginAttempts.delete(k);
  }
}
export function checkLoginRateLimit(key: string, maxAttempts = 10, windowMs = 15 * 60 * 1000): { allowed: boolean; retryAfterSec?: number } {
  cleanupAttempts();
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (entry?.lockedUntil && entry.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  if (!entry || entry.resetAt < now) {
    return { allowed: true };
  }
  if (entry.count >= maxAttempts) {
    // Lock for remaining window
    entry.lockedUntil = entry.resetAt;
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true };
}
export function recordLoginAttempt(key: string, success: boolean, windowMs = 15 * 60 * 1000): void {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (success) {
    loginAttempts.delete(key);
    return;
  }
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count += 1;
    if (entry.count >= 10) entry.lockedUntil = entry.resetAt;
  }
}
export async function getRequestIp(): Promise<string> {
  try {
    const h = await headers();
    const cf = h.get("cf-connecting-ip");
    if (cf) return cf.trim();
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]?.trim() || "unknown";
    const real = h.get("x-real-ip");
    if (real) return real.trim();
    return "unknown";
  } catch {
    return "unknown";
  }
}

export async function registerUser(name: string, email: string, password: string): Promise<SafeUser> {
  const passwordData = await hashPassword(password);
  const now = new Date().toISOString();
  const user: StoredUser = {
    id: randomUUID(),
    name: name.trim().slice(0, 60),
    email: normalizeEmail(email),
    passwordHash: passwordData.hash,
    passwordSalt: passwordData.salt,
    createdAt: now,
    lastLoginAt: now,
  };
  await createUser(user);
  return safeUser(user);
}

export async function authenticateUser(email: string, password: string): Promise<SafeUser | null> {
  const user = await findUserByEmail(normalizeEmail(email));
  if (!user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) return null;
  await markLogin(user.id);
  return safeUser({ ...user, lastLoginAt: new Date().toISOString() });
}

export async function createSession(userId: string, remember: boolean): Promise<void> {
  const lifetime = remember ? 30 * 24 * 60 * 60 : 24 * 60 * 60;
  const exp = Math.floor(Date.now() / 1000) + lifetime;
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, encodeSession({ sub: userId, exp }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: lifetime,
    priority: "high",
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function getSessionUserId(): Promise<string | null> {
  const payload = decodeSession((await cookies()).get(COOKIE_NAME)?.value);
  return payload?.sub ?? null;
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const user = await findUserById(userId);
  return user ? safeUser(user) : null;
}

// For middleware: expose verifier
export function verifySessionToken(token: string): boolean {
  return decodeSession(token) !== null;
}
