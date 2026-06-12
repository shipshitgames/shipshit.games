import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

import "./globals.css";

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
          <div aria-hidden="true" className="grain pointer-events-none fixed inset-0 z-50" />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
