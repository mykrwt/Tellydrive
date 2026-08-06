import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";

export function Navbar({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="landing-nav">
      <div className="wrap landing-nav-inner">
        <Link href="/" className="nav-brand" aria-label="TellyDrive home">
          <Logo />
        </Link>
        <nav className="nav-links" aria-label="Product">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="nav-actions">
          <Link href={signedIn ? "/dashboard" : "/sign-up"} className="btn btn-primary">
            {signedIn ? "Dashboard" : "Get Started"} <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
