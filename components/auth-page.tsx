import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";

export function AuthPage({
  mode,
  initialError,
}: {
  mode: "signin" | "signup";
  initialError?: string;
}) {
  return (
    <main className="auth-page">
      <Link href="/" className="auth-brand" aria-label="Back to TellyDrive home">
        <Logo />
      </Link>
      <AuthForm mode={mode} initialError={initialError} />
      <p className="auth-foot">© 2026 TellyDrive · Private by design</p>
    </main>
  );
}
