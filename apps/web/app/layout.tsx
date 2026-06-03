import type { Metadata } from "next";
import "./globals.css";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { Grain } from "@/components/site/atmosphere";

export const metadata: Metadata = {
  metadataBase: new URL("https://games.shipshit.dev"),
  title: {
    default: "Ship Shit Games — DOOM × Blizzard, forged live",
    template: "%s — Ship Shit Games",
  },
  description:
    "Open-source AI game studio. One brutal, blood-soaked IP universe — DOOM's gore with Blizzard's cohesion — built live on the shipshitshow.",
  openGraph: {
    title: "Ship Shit Games",
    description:
      "One blood-soaked universe. Six browser games. The Scourge eats worlds — you make it pay.",
    url: "https://games.shipshit.dev",
    siteName: "Ship Shit Games",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-void font-body text-ash antialiased">
        <Grain />
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
