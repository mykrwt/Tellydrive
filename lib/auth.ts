import "server-only";

import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
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
  return (
    process.env.SESSION_SECRET ||
    process.env.TELEGRAM_BOT_TOKEN ||
    (process.env.NODE_ENV !== "production" ? "tellybase-local-development-session-key" : "")
  );
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
    return payload;
  } catch {
    return null;
  }
}

export async function registerUser(name: string, email: string, password: string): Promise<SafeUser> {
  const passwordData = await hashPassword(password);
  const now = new Date().toISOString();
  const user: StoredUser = {
    id: randomUUID(),
    name: name.trim(),
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
    sameSite: "lax",
    path: "/",
    maxAge: lifetime,
    priority: "high",
  });
}

export async function deleteSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
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
