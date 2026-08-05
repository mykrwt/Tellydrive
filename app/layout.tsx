import type { Metadata } from "next";
import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import "./globals.css";

// Keep the scaffold's font class hooks without requiring a network font fetch at build time.
const geistSans = { variable: "font-geist-sans" };
const geistMono = { variable: "font-geist-mono" };

export const metadata: Metadata = {
  title: "Cloudlane — Storage that stays simple",
  description: "Private, affordable cloud storage for your visual work.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <header className="site-header">
            <Link href="/" className="brand" aria-label="Cloudlane home">
              <span className="brand-mark"><i /><i /><i /></span>
              <span>cloudlane</span>
            </Link>
            <nav aria-label="Main navigation">
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <Link href="/dashboard">Dashboard</Link>
            </nav>
            <div className="auth-actions">
              <Show when="signed-out">
                <SignInButton>
                  <button className="button button-quiet">Log in</button>
                </SignInButton>
                <SignUpButton>
                  <button className="button button-primary">Start for free <span>→</span></button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <Link className="button button-quiet" href="/dashboard">Open dashboard</Link>
                <UserButton />
              </Show>
            </div>
          </header>
          {children}
          <footer className="site-footer">
            <Link href="/" className="brand"><span className="brand-mark"><i /><i /><i /></span><span>cloudlane</span></Link>
            <p>Storage for the work you care about.</p>
            <span>© 2026 Cloudlane</span>
          </footer>
        </ClerkProvider>
      </body>
    </html>
  );
}
