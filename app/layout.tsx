import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import Link from "next/link";
import { isClerkConfigured } from "@/lib/config";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Tellybase — Storage that stays simple",
  description: "Private, affordable cloud storage for your visual work.",
};

const geistSans = { variable: "font-geist-sans" };
const geistMono = { variable: "font-geist-mono" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const clerkReady = isClerkConfigured();
  const header = <SiteHeader clerkReady={clerkReady} />;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {clerkReady ? (
          <ClerkProvider>
            {header}
            {children}
          </ClerkProvider>
        ) : (
          <>
            {header}
            {children}
          </>
        )}
        <footer className="site-footer">
          <Link href="/" className="brand">
            <span className="brand-mark"><i /><i /><i /></span>
            <span>tellybase</span>
          </Link>
          <p>Storage for the work you care about.</p>
          <span>© 2026 Tellybase</span>
        </footer>
      </body>
    </html>
  );
}
