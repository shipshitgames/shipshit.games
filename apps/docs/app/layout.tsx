import type { Metadata } from "next";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import "nextra-theme-docs/style.css";
import "./globals.css";

const docsUrl =
  process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.shipshit.games";

export const metadata: Metadata = {
  metadataBase: new URL(docsUrl),
  title: {
    default: "Ship Shit Games Docs",
    template: "%s - Ship Shit Games Docs",
  },
  description:
    "Public documentation for Ship Shit Games tools, workflows, canon, and studio systems.",
  openGraph: {
    title: "Ship Shit Games Docs",
    description:
      "How to use the Ship Shit Games tooling: asset generation, source distillation, engine, UI, and studio workflows.",
    url: docsUrl,
    siteName: "Ship Shit Games Docs",
    type: "website",
  },
};

const navbar = (
  <Navbar
    logo={
      <span className="ssg-logo">
        Ship <span>Shit</span> Games Docs
      </span>
    }
  />
);

const footer = (
  <Footer>
    Ship Shit Games docs. Built with Nextra. Source lives in apps/docs.
  </Footer>
);

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head>
        <meta name="theme-color" content="#0a0a0a" />
      </Head>
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/shipshitgames/shipshitgames/tree/master/apps/docs"
          footer={footer}
          sidebar={{ defaultMenuCollapseLevel: 1 }}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
