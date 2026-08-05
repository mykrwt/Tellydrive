import { SignIn } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/config";
import { SetupNotice } from "@/components/setup-notice";

export default function SignInPage() {
  if (!isClerkConfigured()) return <SetupNotice what="Clerk authentication" />;
  return (
    <main className="auth-shell">
      <SignIn />
    </main>
  );
}
