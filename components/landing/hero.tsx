import Link from "next/link";

export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="hero">
      <div className="wrap hero-inner">
        <div className="hero-copy">
          <h1>
            The cloud drive
            <br />
            that never fills up.
          </h1>
          <p className="hero-sub">Unlimited space. Instant sync. Total privacy.</p>
          <div className="hero-actions">
            <Link href={signedIn ? "/dashboard" : "/sign-up"} className="btn btn-primary btn-lg">
              {signedIn ? "Open dashboard" : "Get Started"}
            </Link>
            <a href="#how-it-works" className="btn btn-ghost btn-lg">
              How it works
            </a>
          </div>
          <p className="hero-note">Free plan · No credit card · 60-second setup</p>
        </div>
      </div>
    </section>
  );
}
