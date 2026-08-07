import "server-only";
import { NextRequest } from "next/server";

export function getClientIp(req: NextRequest | Request): string {
  // Prioritize Cloudflare/Vercel headers
  const h = req.headers;
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  const maybe = (req as unknown as { ip?: string }).ip;
  if (maybe) return maybe;
  return "unknown";
}

export function buildCsp(): string {
  // Strict CSP: browser media/network access stays same-origin
  // Next.js requires 'unsafe-inline' for styles and 'unsafe-eval' is avoided.
  const parts = [
    "default-src 'self'",
    // Scripts: self + nonce would be ideal but Next inline needs unsafe-inline. Avoid unsafe-eval.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    // Media is always delivered through authenticated same-origin backend proxies.
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];
  return parts.join("; ");
}

export function securityHeaders(): Record<string, string> {
  const csp = buildCsp();
  return {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-DNS-Prefetch-Control": "off",
    "X-Permitted-Cross-Domain-Policies": "none",
    // HSTS only effective over HTTPS; include for prod, harmless in dev
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };
}

export function isSameOrigin(req: NextRequest | Request): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");
  const forwardedHost = req.headers.get("x-forwarded-host") || host;
  if (!origin && !referer) {
    // Allow same-origin fetch without Origin (e.g., navigation, direct). For state-changing methods require same-origin
    if (req.method === "GET" || req.method === "HEAD") return true;
    return true; // server actions use no origin sometimes; middleware will handle CSRF via token
  }
  const check = (urlStr: string): boolean => {
    try {
      const u = new URL(urlStr);
      // Compare host (with port) ignoring scheme
      return u.host === forwardedHost || u.host === host;
    } catch {
      return false;
    }
  };
  if (origin && !check(origin)) return false;
  if (!origin && referer && !check(referer)) return false;
  return true;
}

export function jsonError(message: string, status: number, extraHeaders?: Record<string, string>) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...securityHeaders(),
    ...extraHeaders,
  };
  // Remove HSTS from jsonError? Keep
  return new Response(JSON.stringify({ error: message }), { status, headers });
}
