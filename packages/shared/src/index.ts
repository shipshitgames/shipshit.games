/**
 * Shared types and utilities for the Ship Shit Games platform.
 */

/** Lifecycle status of a game in the gallery. */
export type GameStatus = "playable" | "in-dev" | "concept";

/** A single open-source game shown in the gallery. */
export interface Game {
  /** URL-safe identifier, e.g. "scourge-survivors". */
  slug: string;
  /** Display title. */
  title: string;
  /** One-line pitch. */
  blurb: string;
  /** Where the game is in its lifecycle. */
  status: GameStatus;
  /** Live playable demo, if any. */
  demoUrl?: string;
  /** Source repository. */
  repoUrl: string;
}

/** Human-readable labels for each status. */
export const STATUS_LABELS: Record<GameStatus, string> = {
  playable: "Playable",
  "in-dev": "In Dev",
  concept: "Concept",
};

/** The Ship Shit Games catalogue, in gallery order. */
export const GAMES: Game[] = [
  {
    slug: "scourge-survivors",
    title: "Scourge Survivors",
    blurb: "First-person horde-survivors — Vampire Survivors x DOOM.",
    status: "playable",
    demoUrl: "https://scourge-survivors.vercel.app",
    repoUrl: "https://github.com/shipshitgames/scourge-survivors",
  },
  {
    slug: "deadlane",
    title: "Deadlane",
    blurb: "3D tower defense — hold the line for the Wardens.",
    status: "in-dev",
    repoUrl: "https://github.com/shipshitgames/deadlane",
  },
  {
    slug: "pactfall",
    title: "Pactfall",
    blurb: "Pyre-vs-Wardens MOBA built around the Pact.",
    status: "concept",
    repoUrl: "https://github.com/shipshitgames/pactfall",
  },
  {
    slug: "starblight",
    title: "Starblight",
    blurb: "Arcade pilot shooter against the orbital infection.",
    status: "concept",
    repoUrl: "https://github.com/shipshitgames/starblight",
  },
];

/** Studio subscription sold through Stripe and managed in app.shipshit.games. */
export const STUDIO_PASS = {
  name: "Skills Pro Studio Pass",
  shortName: "Studio Pass",
  productKey: "studio-pass",
  stripeProductMetadataKey: "studio_pass",
  tagline: "Skills Pro, community access, member assets, and live studio workflows.",
  listPriceUsd: 49,
  founderPriceUsd: 29,
  founderDiscountUsd: 20,
  interval: "month",
  defaultCouponId: "STUDIOFOUNDER20",
  priceLookupKey: "shipshit-studio-pass-49-usd-monthly",
  priceEnvKey: "STRIPE_STUDIO_PASS_PRICE_ID",
  couponEnvKey: "STRIPE_STUDIO_PASS_FOUNDER_COUPON_ID",
} as const;

export const STUDIO_PASS_FEATURES = [
  "Skills Pro: the agent skills, prompts, QA loops, and shipping workflows behind the studio.",
  "Private community access for drops, feedback, office hours, and build-in-public accountability.",
  "Monthly seat to the member asset library and new production packs as they ship.",
  "app.shipshit.games account portal for signed access links, billing, and subscription state.",
] as const;

export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

export type ActiveSubscriptionStatus =
  (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number];

export function isActiveSubscriptionStatus(status?: string | null) {
  return ACTIVE_SUBSCRIPTION_STATUSES.includes(status as ActiveSubscriptionStatus);
}

export function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}
