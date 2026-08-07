import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/admin";
import type { SafeUser } from "@/lib/auth";
import { checkIpRateLimit, getRetryAfterSec, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_JSON_BYTES = 16 * 1024;

export function mobileJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export function requestIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function enforceMobileAuthRateLimit(request: NextRequest): NextResponse | null {
  try {
    checkIpRateLimit(requestIp(request), "auth");
    return null;
  } catch (error: unknown) {
    const details = error as { resetAt?: number; result?: Parameters<typeof rateLimitHeaders>[0] };
    const retryAfter = getRetryAfterSec(details.resetAt ?? Date.now() + 60_000);
    return mobileJson(
      { error: `Too many attempts. Try again in ${retryAfter}s.` },
      {
        status: 429,
        headers: {
          ...(details.result ? rateLimitHeaders(details.result) : {}),
          "Retry-After": String(retryAfter),
        },
      },
    );
  }
}

export async function readMobileJson(request: NextRequest): Promise<Record<string, unknown> | null> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return null;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) return null;
  try {
    const value: unknown = await request.json();
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function mobileUser(user: SafeUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    role: isAdminUser(user) ? "admin" : "user",
    isAdmin: isAdminUser(user),
  };
}
