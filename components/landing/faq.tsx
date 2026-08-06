"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";

const faqs = [
  {
    q: "Is it really unlimited?",
    a: "Yes. No caps, no throttling, no asterisks.",
  },
  {
    q: "Where is my data stored?",
    a: "In your own sealed cloud vault — encrypted, redundant, and visible to you alone.",
  },
  {
    q: "Why is it so cheap?",
    a: "We build on world-class cloud infrastructure instead of owning data centers — 100% uptime at a fraction of the price.",
  },
  {
    q: "What can I store?",
    a: "Anything lawful — photos, 4K video, backups. Up to 20 GB per file on Pro.",
  },
  {
    q: "How do I cancel or export?",
    a: "One click, anytime. Canceling never deletes your files.",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="landing-section section-tinted" id="faq">
      <div className="wrap">
        <div className="section-head reveal">
          <p className="eyebrow">FAQ</p>
          <h2>Answers, before you ask.</h2>
        </div>
        <div className="faq-list reveal">
          {faqs.map((faq, index) => {
            const open = openIndex === index;
            return (
              <div className={`faq-item${open ? " is-open" : ""}`} key={faq.q}>
                <button
                  type="button"
                  className="faq-q"
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? null : index)}
                >
                  {faq.q}
                  <span className="faq-icon">
                    <Plus aria-hidden="true" />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      className="faq-a"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
                    >
                      <p className="faq-answer">{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
