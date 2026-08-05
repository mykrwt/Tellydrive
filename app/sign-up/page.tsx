import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth-page";
import { getSessionUserId } from "@/lib/auth";
import { databaseMode } from "@/lib/telegram-store";

export const metadata = { title: "Create account" };

export default async function SignUpPage() {
  if (await getSessionUserId()) redirect("/dashboard");
  return <AuthPage mode="signup" database={databaseMode()} />;
}
