import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth-page";
import { getSessionUserId } from "@/lib/auth";
import { databaseMode } from "@/lib/telegram-store";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getSessionUserId()) redirect("/dashboard");
  return <AuthPage mode="signin" database={databaseMode()} />;
}
