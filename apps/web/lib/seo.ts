/** JSON-LD structured-data helpers. Render via a script tag in server components. */
import type { Game } from "@shipshitgames/shared";

import type { GameLore } from "@/lib/content/types";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://shipshit.games";

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Ship Shit Games",
    url: SITE_URL,
    logo: `${SITE_URL}/brand/shipshit-games-wordmark.png`,
    sameAs: [
      "https://github.com/shipshitgames",
      "https://youtube.com/@ShipShitShow",
      "https://deadrot.com",
    ],
  };
}

export function videoGameJsonLd(game: Game, lore: GameLore | null) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.title,
    url: `${SITE_URL}/games/${game.slug}`,
    image: `${SITE_URL}${game.coverPath}`,
    description: lore?.overview ?? game.summary,
    genre: game.genre,
    gamePlatform: "Web browser",
    applicationCategory: "Game",
    publisher: { "@type": "Organization", name: "Ship Shit Games", url: SITE_URL },
    ...(game.demoUrl ? { gameServer: game.demoUrl } : {}),
  };
}

export interface BreadcrumbItem {
  name: string;
  href: string;
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.href}`,
    })),
  };
}

/** Serialize for a <script type="application/ld+json"> tag. */
export function jsonLdString(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
