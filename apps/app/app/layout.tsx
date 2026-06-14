import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-inter",
});

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-oswald",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://app.shipshit.games"),
  title: {
    default: "Ship Shit Games App",
    template: "%s - Ship Shit Games App",
  },
  description:
    "Account, billing, signed access, and member assets for the Ship Shit Games Studio Pass.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${inter.variable} ${oswald.variable}`}
        style={
          {
            "--font-body": 'var(--font-inter), system-ui, sans-serif',
            "--font-display":
              'var(--font-oswald), "Arial Narrow", "Helvetica Neue", sans-serif',
          } as CSSProperties
        }
      >
        <body className="min-h-screen bg-void font-body text-ash antialiased">
          <div aria-hidden="true" className="grain pointer-events-none fixed inset-0 z-50" />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
