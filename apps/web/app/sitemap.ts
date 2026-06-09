import type { MetadataRoute } from "next";

import { GAMES } from "@shipshitgames/shared";

import { SITE_URL } from "@/lib/seo";

const STATIC_ROUTES = [
  "/",
  "/games",
  "/factions",
  "/assets",
  "/log",
  "/youtube",
  "/pricing",
  "/legal",
] as const;

const FACTION_SLUGS = [
  "the-pyre",
  "the-wardens",
  "the-listeners",
  "scourge",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const routes: string[] = [
    ...STATIC_ROUTES,
    ...GAMES.map((game) => `/games/${game.slug}`),
    ...FACTION_SLUGS.map((slug) => `/factions/${slug}`),
  ];

  return routes.map((route) => ({
    url: route === "/" ? SITE_URL : `${SITE_URL}${route}`,
    lastModified,
  }));
}
