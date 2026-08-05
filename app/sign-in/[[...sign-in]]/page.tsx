import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isClerkConfigured } from "@/lib/config";
import { SetupNotice } from "@/components/setup-notice";

export default async function SignInPage() {
  if (!isClerkConfigured()) return <SetupNotice what="Clerk authentication" />;

  // If a session already exists, send the user straight to the dashboard.
  // Otherwise Clerk's <SignIn/> detects the signed-in user and redirects to
  // the Home URL by default, which turns "click Dashboard" into a bounce back
  // to the homepage.
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <main className="auth-shell">
      <SignIn fallbackRedirectUrl="/dashboard" />
    </main>
  );
}
