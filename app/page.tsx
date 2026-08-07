import { authorizeRequest } from "@/lib/backend-authority";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Pricing } from "@/components/landing/pricing";
import { Faq } from "@/components/landing/faq";
import { Cta } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";

export const metadata = {
  title: { absolute: "TellyBase — Premium cloud storage" },
  description: "Premium cloud storage with instant sync, privacy-first sharing, and Telegram-backed durability.",
};

export default async function Home() {
  let signedIn = false;
  try {
    await authorizeRequest("account:read");
    signedIn = true;
  } catch {
    // Client cookies are never treated as account authority.
  }

  return (
    <main className="landing-page">
      <Navbar signedIn={signedIn} />
      <Hero signedIn={signedIn} />
      <Features />
      <HowItWorks />
      <Pricing signedIn={signedIn} />
      <Faq />
      <Cta signedIn={signedIn} />
      <Footer />
    </main>
  );
}
