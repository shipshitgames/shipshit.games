import type { Metadata } from "next";
import "./globals.css";

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
    "The studio building the DEADROT universe live with AI. We ship games in public and sell the playbook — newsletter, course, templates, and the tools we built to do it.",
  openGraph: {
    title: "Ship Shit Games",
    description:
      "Building games with AI, in public. Steal the playbook — newsletter, course, templates, and tooling.",
    url: "https://shipshit.games",
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
