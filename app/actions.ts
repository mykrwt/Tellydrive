"use server";

import { redirect } from "next/navigation";
import {
  authenticateUser,
  createSession,
  deleteSession,
  normalizeEmail,
  registerUser,
  validateEmail,
  validatePassword,
} from "@/lib/auth";
import { AccountStoreError } from "@/lib/telegram-store";

export type AuthState = { error?: string; success?: boolean };

function storeMessage(error: unknown): string {
  console.error("Authentication store error:", error);
  if (error instanceof AccountStoreError && error.setupProblem) {
    return "Telegram is not connected. Check the bot token, chat ID, and bot admin access.";
  }
  if (error instanceof AccountStoreError) return error.message;
  return "The account service is temporarily unavailable. Please try again.";
}

export async function signIn(_state: AuthState, formData: FormData): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";

  if (!validateEmail(email) || !password) return { error: "Enter a valid email and password." };

  let user;
  try {
    user = await authenticateUser(email, password);
  } catch (error) {
    return { error: storeMessage(error) };
  }
  if (!user) return { error: "Email or password is incorrect." };

  await createSession(user.id, remember);
  redirect("/dashboard");
}

export async function signUp(_state: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");

  if (name.length < 2 || name.length > 60) return { error: "Name must be between 2 and 60 characters." };
  if (!validateEmail(email)) return { error: "Enter a valid email address." };
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };
  if (password !== confirmation) return { error: "Passwords do not match." };

  let user;
  try {
    user = await registerUser(name, email, password);
  } catch (error) {
    return { error: storeMessage(error) };
  }

  await createSession(user.id, true);
  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  await deleteSession();
  redirect("/sign-in");
}
