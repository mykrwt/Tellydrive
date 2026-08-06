import type { Metadata } from "next";
import "./globals.css";
import "./dashboard-ui.css";

export const metadata: Metadata = {
  title: { default: "TellyBase — Premium Cloud Storage", template: "%s · TellyBase" },
  description: "Secure cloud storage and media vault backed by Telegram infrastructure.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
