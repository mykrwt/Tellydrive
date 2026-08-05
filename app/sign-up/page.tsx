import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth-page";
import { getSessionUserId } from "@/lib/auth";
import { databaseMode } from "@/lib/telegram-store";

export const metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const initialError =
    params?.error === "store"
      ? "Could not reach the account store. Check Telegram bot token, chat ID, and bot admin rights."
      : params?.error;

  if (await getSessionUserId()) redirect("/dashboard");
  return <AuthPage mode="signup" database={databaseMode()} initialError={initialError} />;
}
