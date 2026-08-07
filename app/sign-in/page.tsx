import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth-page";
import { getSessionUserId } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const initialError =
    params?.error === "store"
      ? "The account service is temporarily unavailable. Please try again later."
      : params?.error;

  if (await getSessionUserId()) redirect("/dashboard");
  return <AuthPage mode="signin" initialError={initialError} />;
}
