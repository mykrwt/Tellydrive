import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TellyDrive — Unlimited Cloud Storage", template: "%s · TellyDrive" },
  description: "Secure cloud storage & media vault backed by Telegram infrastructure.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
