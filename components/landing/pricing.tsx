"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type Tier = {
  name: string;
  desc: string;
  monthly: number;
  yearly: number;
  cta: string;
  href: string;
  featured?: boolean;
  features: string[];
};

const tiers: Tier[] = [
  {
    name: "Starter",
    desc: "For trying it out and keeping the essentials close.",
    monthly: 0,
    yearly: 0,
    cta: "Get Started",
    href: "/sign-up",
    features: [
      "10 GB storage",
      "Files up to 500 MB",
      "Access on all devices",
      "7-day version history",
      "Community support",
    ],
  },
  {
    name: "Plus",
    desc: "For everyday storage that grows with your life.",
    monthly: 4,
    yearly: 3,
    cta: "Go Plus",
    href: "/sign-up?plan=plus",
    featured: true,
    features: [
      "200 GB storage",
      "Files up to 4 GB",
      "Secure share links",
      "30-day version history",
      "Priority uploads",
      "Email support",
    ],
  },
  {
    name: "Pro",
    desc: "For creators and hoarders who keep everything.",
    monthly: 10,
    yearly: 8,
    cta: "Go Pro",
    href: "/sign-up?plan=pro",
    features: [
      "Unlimited storage",
      "Files up to 20 GB",
      "Unlimited share links",
      "Unlimited version history",
      "Top-priority uploads",
      "Priority support",
    ],
  },
];

export function Pricing({ signedIn }: { signedIn: boolean }) {
  const [yearlyBilling, setYearlyBilling] = useState(true);

  return (
    <section className="landing-section" id="pricing">
      <div className="wrap">
        <div className="section-head reveal">
          <p className="eyebrow">Pricing</p>
          <h2>Priced like storage should be.</h2>
          <p>No ads. No surprises. Cancel anytime.</p>
        </div>

        <div className="pricing-toggle" role="group" aria-label="Billing period">
          <button
            type="button"
            className={yearlyBilling ? "" : "active"}
            aria-pressed={!yearlyBilling}
            onClick={() => setYearlyBilling(false)}
          >
            {!yearlyBilling && (
              <motion.span
                className="toggle-pill"
                layoutId="billing-pill"
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              />
            )}
            <span className="toggle-label">Monthly</span>
          </button>
          <button
            type="button"
            className={yearlyBilling ? "active" : ""}
            aria-pressed={yearlyBilling}
            onClick={() => setYearlyBilling(true)}
          >
            {yearlyBilling && (
              <motion.span
                className="toggle-pill"
                layoutId="billing-pill"
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              />
            )}
            <span className="toggle-label">
              Yearly <span className="save-pill">save up to 25%</span>
            </span>
          </button>
        </div>

        <div className="pricing-grid">
          {tiers.map((tier) => {
            const price = yearlyBilling ? tier.yearly : tier.monthly;
            return (
              <article className={`price-card reveal${tier.featured ? " featured" : ""}`} key={tier.name}>
                {tier.featured && <span className="popular-pill">Most popular</span>}
                <h3 className="price-name">{tier.name}</h3>
                <p className="price-desc">{tier.desc}</p>
                <div className="price-row">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      className="price-amount"
                      key={`${tier.name}-${price}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                      ${price}
                    </motion.span>
                  </AnimatePresence>
                  <span className="price-per">/ mo</span>
                </div>
                <p className="price-bill-note">
                  {price === 0
                    ? "Free forever"
                    : yearlyBilling
                      ? `Billed annually · $${(price * 12).toLocaleString()}/yr`
                      : "Billed monthly · cancel anytime"}
                </p>
                <div className="price-cta">
                  <Link
                    href={signedIn ? "/dashboard" : tier.href}
                    className={`btn btn-block ${tier.featured ? "btn-primary" : "btn-ghost"}`}
                  >
                    {signedIn ? "Open dashboard" : tier.cta}
                  </Link>
                </div>
                <ul className="price-features">
                  {tier.features.map((feature) => (
                    <li key={feature}>
                      <Check aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
