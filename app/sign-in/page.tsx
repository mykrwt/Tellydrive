import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth-page";
import { getSessionUserId } from "@/lib/auth";
import { databaseMode } from "@/lib/telegram-store";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
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
  return <AuthPage mode="signin" database={databaseMode()} initialError={initialError} />;
}
