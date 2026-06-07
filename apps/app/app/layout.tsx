import type { Metadata } from "next";
import Link from "next/link";
import { ClerkProvider, SignInButton, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userId } = await auth();

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
          <header className="sticky top-0 z-40 border-b border-gunmetal/60 bg-void/90 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
              <Link
                href="/dashboard"
                className="font-display text-lg font-bold uppercase tracking-tight text-bone"
              >
                Ship <span className="text-blood">Shit</span> App
              </Link>
              <nav className="hidden items-center gap-6 md:flex">
                <Link className="text-xs font-bold uppercase tracking-widest text-ash hover:text-bone" href="/dashboard">
                  Dashboard
                </Link>
                <Link className="text-xs font-bold uppercase tracking-widest text-ash hover:text-bone" href="/access">
                  Access
                </Link>
                <Link className="text-xs font-bold uppercase tracking-widest text-ash hover:text-bone" href="/billing">
                  Billing
                </Link>
                <a className="text-xs font-bold uppercase tracking-widest text-ash hover:text-bone" href="https://shipshit.games">
                  Site
                </a>
              </nav>
              <div className="flex items-center gap-3">
                {userId ? (
                  <UserButton />
                ) : (
                  <SignInButton mode="modal">
                    <button className="rounded-md border border-gunmetal px-4 py-2 font-display text-xs font-bold uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire">
                      Sign in
                    </button>
                  </SignInButton>
                )}
              </div>
            </div>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
