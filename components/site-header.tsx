import Link from "next/link";
import { AuthHeader } from "@/components/auth-header";

export function SiteHeader({ clerkReady }: { clerkReady: boolean }) {
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="Tellybase home">
        <span className="brand-mark"><i /><i /><i /></span>
        <span>tellybase</span>
      </Link>
      <nav aria-label="Main navigation">
        <a href="#features">Features</a>
        <a href="#pricing">Pricing</a>
        <Link href="/dashboard">Dashboard</Link>
      </nav>
      <div className="auth-actions">
        {clerkReady ? (
          <AuthHeader />
        ) : (
          <>
            <Link className="button button-quiet" href="/sign-in">Log in</Link>
            <Link className="button button-primary" href="/sign-up">Start for free <span>→</span></Link>
          </>
        )}
      </div>
    </header>
  );
}
