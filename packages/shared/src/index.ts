/**
 * Shared types and utilities for the Ship Shit Games platform.
 */
import gamesCatalog from "./games.json";

/** Feature flags — `isEnabled("flag")`. See ./flags and FEATURE_FLAGS.md. */
export * from "./flags";

/** Shared asset-origin URL helpers for package-relative Deadrot assets. */
export * from "./assets";

/** Lifecycle status of a game in the gallery. */
export type GameStatus = "finished" | "playable" | "prototype" | "in-dev" | "concept";

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
  /** Deadrot faction or product lane. */
  faction: string;
  /** Player-facing genre label. */
  genre: string;
  /** Short course/funnel proof angle for Ship Shit Games. */
  courseAngle: string;
  /** Longer gallery/detail-page summary. */
  summary: string;
  /** Cover art path in the shipshit.games web app. */
  coverPath: string;
  /** Public Deadrot hub page or canonical game URL. */
  deadrotUrl: string;
  /** Direct play route on the Deadrot hub (deadrot.com/<slug>). */
  playUrl: string;
  /** Deadrot finished-product issue URL. */
  readinessIssueUrl: string;
  /** Specific proof bullets shown on the detail page. */
  proofPoints: readonly string[];
  /** Live playable demo, if any. */
  demoUrl?: string;
  /** Source repository. */
  repoUrl: string;
}

/** Human-readable labels for each status. */
export const STATUS_LABELS: Record<GameStatus, string> = {
  finished: "Finished",
  playable: "Playable",
  prototype: "Prototype",
  "in-dev": "In Dev",
  concept: "Concept",
};

interface GamesCatalog {
  gameSlugs: string[];
  games: Game[];
}

const catalog = gamesCatalog as unknown as GamesCatalog;

/**
 * Canonical asset-generation game slugs used by studio tools (assetgen,
 * desktop), sourced from games.json so every surface shares one list.
 * This is the art-target subset; the marketing gallery in GAMES may carry
 * additional non-art-target products (e.g. the warline strategy hub).
 */
export const GAME_SLUGS = catalog.gameSlugs;

/** The Ship Shit Games catalogue, in gallery order. */
export const GAMES: Game[] = catalog.games;

/** Studio subscription sold through Stripe and managed in app.shipshit.games. */
export const STUDIO_PASS = {
  name: "Studio Pass",
  shortName: "Studio Pass",
  productKey: "studio-pass",
  stripeProductMetadataKey: "studio_pass",
  tagline: "Skills Pro, hosted SaaS access, the Skool community, and every DEADROT game — one subscription.",
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
  "Hosted SaaS access to the studio labs and generation tools; metered monthly generation credits are on the way.",
  "Every DEADROT game unlocked on deadrot.com — the games are the proof-of-concept, included with your pass.",
  "Skool community access is included when the private community opens; founder seats keep their price.",
  "app.shipshit.games account portal for signed access links, billing, and subscription state.",
] as const;

/**
 * One-time purchase sold on the shipshit.games games line: the gaming Skills
 * Pro content ONLY (agent skills, prompts, QA loops, shipping workflows).
 * Deliberately narrower than the Studio Pass subscription — no hosted SaaS
 * generation, no DEADROT games, no Skool. Distinct Stripe product from any
 * shipshit.dev/skills (dev) line; identity is games-namespaced.
 */
export const SKILLS_PRO_ONETIME = {
  name: "Skills Pro",
  shortName: "Skills Pro",
  productKey: "games-skills-pro",
  stripeProductId: "prod_UeXgHMcvrwmGq9",
  tagline: "Every agent skill, prompt, and QA loop we use to ship games — yours once, kept forever.",
  listPriceUsd: 29,
  launchPriceUsd: 19,
  launchDiscountUsd: 10,
  launchMaxRedemptions: 1000,
  interval: "one-time",
  defaultCouponId: "SKILLSPRO10",
  priceLookupKey: "shipshitgames-skills-pro-29-usd",
  priceEnvKey: "STRIPE_SKILLS_PRO_ONETIME_PRICE_ID",
  couponEnvKey: "STRIPE_SKILLS_PRO_ONETIME_COUPON_ID",
} as const;

export const SKILLS_PRO_ONETIME_FEATURES = [
  "Every game-building agent skill: planning, scaffolding, implementation, review, QA, and ship loops.",
  "The production prompts and workflows behind DEADROT — copy them, adapt them, ship your own games.",
  "A one-time purchase you keep forever — no subscription. Skills only: no hosted SaaS generation, no games, no community.",
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
