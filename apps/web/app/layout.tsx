import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
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

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { Grain } from "@/components/site/atmosphere";

export const metadata: Metadata = {
  metadataBase: new URL("https://shipshit.games"),
  title: {
    default: "Ship Shit Games — building games with AI, in public",
    template: "%s — Ship Shit Games",
  },
  description:
    "The studio building the DEADROT universe live with AI. We ship games in public and sell the monthly Studio Pass: skills, assets, build breakdowns, and the tools we built to do it.",
  openGraph: {
    title: "Ship Shit Games",
    description:
      "Building games with AI, in public. Get the monthly Studio Pass for skills, assets, build breakdowns, and tooling.",
    url: "https://shipshit.games",
    siteName: "Ship Shit Games",
    type: "website",
    images: [
      {
        url: "/images/og/shipshit-games.jpg",
        width: 1200,
        height: 630,
        alt: "Ship Shit Games",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ship Shit Games",
    description: "Building games with AI, in public.",
    images: ["/images/og/shipshit-games.jpg"],
  },
  icons: {
    icon: [{ url: "/icon.png", sizes: "420x420", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", sizes: "420x420", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${oswald.variable}`}
      style={
        {
          "--font-body": 'var(--font-inter), system-ui, sans-serif',
          "--font-display":
            'var(--font-oswald), "Arial Narrow", "Helvetica Neue", sans-serif',
          "--font-label":
            'var(--font-oswald), "Arial Narrow", "Helvetica Neue", sans-serif',
        } as React.CSSProperties
      }
    >
      <body className="min-h-screen bg-void font-body text-ash antialiased">
        <Grain />
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
