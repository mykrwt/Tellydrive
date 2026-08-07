import { NextRequest } from "next/server";
import { assertPublicSignupAllowed, AuthorityError } from "@/lib/backend-authority";
import {
  createSession,
  normalizeEmail,
  registerUser,
  validateEmail,
  validatePassword,
} from "@/lib/auth";
import {
  enforceMobileAuthRateLimit,
  mobileJson,
  mobileUser,
  readMobileJson,
} from "@/app/api/mobile/v1/_shared";

export async function POST(request: NextRequest) {
  const limited = enforceMobileAuthRateLimit(request);
  if (limited) return limited;

  const body = await readMobileJson(request);
  if (!body) return mobileJson({ error: "Invalid request." }, { status: 400 });

  const name = String(body.name ?? "").trim();
  const email = normalizeEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");
  const confirmation = String(body.confirmPassword ?? "");

  if (name.length < 2 || name.length > 60 || /[<>\u0000-\u001F]/.test(name)) {
    return mobileJson({ error: "Name must be between 2 and 60 valid characters." }, { status: 400 });
  }
  if (!validateEmail(email)) {
    return mobileJson({ error: "Enter a valid email address." }, { status: 400 });
  }
  const passwordError = validatePassword(password);
  if (passwordError) return mobileJson({ error: passwordError }, { status: 400 });
  if (password !== confirmation) {
    return mobileJson({ error: "Passwords do not match." }, { status: 400 });
  }

  try {
    await assertPublicSignupAllowed();
    const user = await registerUser(name, email, password);
    await createSession(user.id, true);
    return mobileJson({ user: mobileUser(user) }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthorityError) {
      return mobileJson({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Mobile sign-up failed:", error);
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("already") || message.includes("exists")) {
      return mobileJson({ error: "An account with this email already exists." }, { status: 409 });
    }
    return mobileJson({ error: "The account service is temporarily unavailable." }, { status: 503 });
  }
}
