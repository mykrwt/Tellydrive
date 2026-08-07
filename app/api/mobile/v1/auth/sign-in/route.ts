import { NextRequest } from "next/server";
import {
  authenticateUser,
  checkLoginRateLimit,
  createSession,
  normalizeEmail,
  recordLoginAttempt,
  validateEmail,
} from "@/lib/auth";
import {
  enforceMobileAuthRateLimit,
  mobileJson,
  mobileUser,
  readMobileJson,
  requestIp,
} from "@/app/api/mobile/v1/_shared";

export async function POST(request: NextRequest) {
  const limited = enforceMobileAuthRateLimit(request);
  if (limited) return limited;

  const body = await readMobileJson(request);
  if (!body) return mobileJson({ error: "Invalid request." }, { status: 400 });

  const email = normalizeEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");
  const remember = body.remember !== false;
  if (!validateEmail(email) || !password || password.length > 128) {
    return mobileJson({ error: "Enter a valid email and password." }, { status: 400 });
  }

  const attemptKey = `mobile:${requestIp(request)}:${email}`;
  const rate = checkLoginRateLimit(attemptKey, 5);
  if (!rate.allowed) {
    return mobileJson(
      { error: `Too many attempts for this email. Try again in ${rate.retryAfterSec ?? 60}s.` },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec ?? 60) } },
    );
  }

  try {
    const user = await authenticateUser(email, password);
    if (!user) {
      recordLoginAttempt(attemptKey, false);
      return mobileJson({ error: "Email or password is incorrect." }, { status: 401 });
    }
    recordLoginAttempt(attemptKey, true);
    await createSession(user.id, remember);
    return mobileJson({ user: mobileUser(user) });
  } catch (error) {
    console.error("Mobile sign-in failed:", error);
    recordLoginAttempt(attemptKey, false);
    return mobileJson({ error: "The account service is temporarily unavailable." }, { status: 503 });
  }
}
