import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ship Shit Games",
  description:
    "Open-source AI game studio. One brutal, blood-soaked IP universe — DOOM x Blizzard — built live on the shipshitshow.",
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
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Inter:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-void font-body text-ash antialiased">
        {children}
      </body>
    </html>
  );
}
