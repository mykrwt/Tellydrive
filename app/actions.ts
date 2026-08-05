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

function formatTelegramError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("chat not found")) {
    return `${message}. Check TELEGRAM_CHAT_ID (channel/supergroup IDs usually start with -100) and ensure the bot is added to the chat.`;
  }
  if (
    lower.includes("not enough rights") ||
    lower.includes("chat_admin_required") ||
    lower.includes("administrator rights")
  ) {
    return `${message}. Make sure the bot is an administrator with permission to edit chat info ("Change Channel Info" or "Change Group Info").`;
  }
  if (
    lower.includes("unauthorized") ||
    lower.includes("invalid token") ||
    lower.includes("bot_token_invalid")
  ) {
    return `${message}. Check TELEGRAM_BOT_TOKEN for typos or formatting issues.`;
  }
  if (lower.includes("supergroups and channels")) {
    return `${message}. Tellybase requires a private channel or supergroup, not a basic group.`;
  }
  if (lower.includes("bot was blocked") || lower.includes("not a member")) {
    return `${message}. Ensure the bot is added to your channel or supergroup as an administrator.`;
  }
  return message;
}

function storeMessage(error: unknown): string {
  console.error("Authentication store error:", error);
  if (error instanceof AccountStoreError) {
    return formatTelegramError(error.message);
  }
  if (error instanceof Error && error.message) {
    return formatTelegramError(error.message);
  }
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
