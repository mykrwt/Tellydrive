import { NextResponse, NextRequest } from "next/server";

// Lightweight session check without importing server-only auth (decode here)
// We duplicate minimal HMAC verify to keep middleware edge-compatible.

const COOKIE_NAME = "tellybase_session";

function sessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.TELEGRAM_BOT_TOKEN ||
    (process.env.NODE_ENV !== "production" ? "tellybase-local-development-session-key" : "")
  );
}

// Very small base64url decode helper
function b64urlToBytes(s: string): Uint8Array {
  // Node/Edge have atob? Use Buffer where available, fallback
  try {
    // @ts-ignore
    if (typeof Buffer !== "undefined") return Buffer.from(s, "base64url");
  } catch {}
  // Edge fallback via atob
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function verifySessionCookie(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const secret = sessionSecret();
  if (!secret) return false;
  const parts = value.split(".");
  if (parts.length !== 2) return false;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return false;
  try {
    // Use Web Crypto for Edge
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    const data = enc.encode(encoded);
    const sigBytes = b64urlToBytes(sig);
    const expected = await crypto.subtle.sign("HMAC", key, data);
    const expBytes = new Uint8Array(expected);
    // Convert to base64url for comparison? Instead compare bytes directly decoded from sig
    // We need to encode expected to base64url to compare, or compare raw bytes after decoding sig base64url
    // Compare lengths
    if (expBytes.length !== sigBytes.length) return false;
    let diff = 0;
    for (let i = 0; i < expBytes.length; i++) diff |= expBytes[i] ^ sigBytes[i];
    if (diff !== 0) return false;
    // Check payload expiry
    const payloadJson = new TextDecoder().decode(b64urlToBytes(encoded));
    const payload = JSON.parse(payloadJson) as { sub?: string; exp?: number };
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return false;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

function cspHeader(): string {
  const parts = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https: http:",
    "media-src 'self' blob: https: http:",
    "connect-src 'self' https://api.telegram.org https://*.telegram.org blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];
  return parts.join("; ");
}

function applySecurityHeaders(res: NextResponse) {
  res.headers.set("Content-Security-Policy", cspHeader());
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  // Do not set Cache-Control globally; set per-route for sensitive pages
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // Apply CSRF check for state-changing API routes: require same-origin
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");
    const host = req.headers.get("host");
    const forwardedHost = req.headers.get("x-forwarded-host") || host;
    const check = (urlStr: string | null): boolean => {
      if (!urlStr) return false;
      try {
        const u = new URL(urlStr);
        return u.host === forwardedHost || u.host === host;
      } catch {
        return false;
      }
    };
    const sameOrigin = (origin && check(origin)) || (!origin && referer && check(referer));
    // Allow same-origin or no-origin for server actions that use fetch with sameSite cookie; but enforce if origin present and mismatched
    if (origin && !check(origin)) {
      const res = NextResponse.json({ error: "Forbidden — cross-origin request blocked" }, { status: 403 });
      return applySecurityHeaders(res);
    }
    // If both missing for POST, still allow but will be rate-limited and auth-checked; strict mode would block.
  }

  // Auth gating
  const isAuthPage = pathname === "/sign-in" || pathname === "/sign-up" || pathname === "/sign-in-flow";
  const isProtected = pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  if (isAuthPage || isProtected) {
    const cookie = req.cookies.get(COOKIE_NAME)?.value;
    const valid = await verifySessionCookie(cookie);
    if (isProtected && !valid) {
      const url = req.nextUrl.clone();
      url.pathname = "/sign-in";
      url.search = "";
      const res = NextResponse.redirect(url);
      return applySecurityHeaders(res);
    }
    if (isAuthPage && valid) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      const res = NextResponse.redirect(url);
      return applySecurityHeaders(res);
    }
  }

  const res = NextResponse.next();
  applySecurityHeaders(res);

  // Sensitive pages: no-store
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/api/") || pathname.startsWith("/sign-")) {
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.headers.set("Pragma", "no-cache");
  }

  return res;
}

export default proxy;
export const config = {
  matcher: [
    // Run on all routes except static assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
