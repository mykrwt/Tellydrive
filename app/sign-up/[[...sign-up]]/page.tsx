import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isClerkConfigured } from "@/lib/config";
import { SetupNotice } from "@/components/setup-notice";

export default async function SignUpPage() {
  if (!isClerkConfigured()) return <SetupNotice what="Clerk authentication" />;

  // If a session already exists, go straight to the dashboard instead of
  // letting Clerk's <SignUp/> bounce the signed-in user to the Home URL.
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <main className="auth-shell">
      <SignUp fallbackRedirectUrl="/dashboard" />
    </main>
  );
}
