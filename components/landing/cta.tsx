import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function Cta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="landing-section cta-section">
      <div className="wrap">
        <div className="cta-panel reveal">
          <p className="eyebrow">Ready when you are</p>
          <h2>Your files deserve more room.</h2>
          <p>Start free. Upgrade when you need to.</p>
          <div className="cta-actions">
            <Link href={signedIn ? "/dashboard" : "/sign-up"} className="btn btn-primary btn-lg">
              {signedIn ? "Open dashboard" : "Get Started"} <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
