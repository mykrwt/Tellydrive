import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";
import type { databaseMode } from "@/lib/telegram-store";

type DatabaseMode = ReturnType<typeof databaseMode>;

export function AuthPage({
  mode,
  database,
  initialError,
}: {
  mode: "signin" | "signup";
  database: DatabaseMode;
  initialError?: string;
}) {
  return (
    <main className="auth-page">
      <Link href="/" className="auth-brand" aria-label="Back to Tellybase home">
        <Logo />
      </Link>
      <AuthForm mode={mode} database={database} initialError={initialError} />
      <p className="auth-foot">© 2026 Tellybase · Private by design</p>
    </main>
  );
}
