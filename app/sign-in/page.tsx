import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth-page";
import { authorizeRequest } from "@/lib/backend-authority";

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
      : params?.error === "access"
        ? "The backend has restricted access to this account or is in maintenance mode."
        : params?.error;

  let approved = false;
  try {
    await authorizeRequest("account:read");
    approved = true;
  } catch {
    // A signed local cookie is not authority; render sign-in unless the backend
    // currently approves the account and system state.
  }
  if (approved) redirect("/dashboard");
  return <AuthPage mode="signin" initialError={initialError} />;
}
