import Link from "next/link";
import { Logo } from "@/components/logo";

const columns = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "How it works", href: "#how-it-works" },
      { label: "Pricing", href: "#pricing" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    heading: "Get started",
    links: [
      { label: "Create account", href: "/sign-up" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="landing-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <Logo />
            <p className="footer-blurb">Calm, unlimited cloud storage.</p>
          </div>
          {columns.map((column) => (
            <nav className="footer-col" key={column.heading} aria-label={column.heading}>
              <h4>{column.heading}</h4>
              {column.links.map((link) =>
                link.href.startsWith("http") ? (
                  <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                ) : link.href.startsWith("/") ? (
                  <Link key={link.label} href={link.href}>
                    {link.label}
                  </Link>
                ) : (
                  <a key={link.label} href={link.href}>
                    {link.label}
                  </a>
                ),
              )}
            </nav>
          ))}
        </div>
        <div className="footer-bottom">
          <span>© 2026 TellyDrive</span>
          <span>Private by design</span>
        </div>
      </div>
    </footer>
  );
}
