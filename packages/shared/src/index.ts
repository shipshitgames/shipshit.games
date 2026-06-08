/**
 * Shared types and utilities for the Ship Shit Games platform.
 */
import gamesCatalog from "./games.json";

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

const catalog = gamesCatalog as { gameSlugs: string[] };

/**
 * Canonical asset-generation game slugs used by studio tools (assetgen,
 * desktop), sourced from games.json so every surface shares one list.
 * This is the art-target subset; the marketing gallery in GAMES may carry
 * additional non-art-target products (e.g. the warline strategy hub).
 */
export const GAME_SLUGS = catalog.gameSlugs;

/** The Ship Shit Games catalogue, in gallery order. */
export const GAMES: Game[] = [
  {
    slug: "scourge-survivors",
    title: "Scourge Survivors",
    blurb: "First-person horde-survivors — Vampire Survivors x DOOM.",
    status: "playable",
    faction: "Pyre",
    genre: "FPS Survivors",
    courseAngle: "Flagship proof for scoped slicing, runtime assets, HUD polish, and E2E playability.",
    summary:
      "A brutal first-person survivor run inside the Deadrot war: hold the breach, burn back the Scourge, and turn one playable slice into the studio's first finished case study.",
    coverPath: "/images/games/scourge-survivors.webp",
    demoUrl: "https://scourge-survivors.vercel.app",
    deadrotUrl: "https://deadrot.com/games/scourge-survivors",
    readinessIssueUrl: "https://github.com/shipshitgames/deadrot.com/issues/242",
    repoUrl: "https://github.com/shipshitgames/deadrot.com/tree/develop/apps/games/scourge-survivors",
    proofPoints: [
      "Finished-product run loop from menu to summary",
      "Runtime asset catalog and pixel-art reskin",
      "Desktop/mobile E2E journey for real play",
    ],
  },
  {
    slug: "deadlane",
    title: "Deadlane",
    blurb: "3D tower defense — hold the line for the Wardens.",
    status: "prototype",
    faction: "Wardens",
    genre: "Lane Defense",
    courseAngle: "Shows how to turn a tiny grid prototype into a readable tower-defense loop.",
    summary:
      "A lane-defense pressure cooker for the Wardens: place defenses, manage economy, survive the wave, and make the front line legible.",
    coverPath: "/images/games/deadlane.webp",
    demoUrl: "https://deadlane-one.vercel.app",
    deadrotUrl: "https://deadrot.com/games/deadlane",
    readinessIssueUrl: "https://github.com/shipshitgames/deadrot.com/issues/243",
    repoUrl: "https://github.com/shipshitgames/deadrot.com/tree/develop/apps/games/deadlane",
    proofPoints: [
      "Grid, pathfinding, towers, waves, and economy",
      "Clear build/fight/fail/restart loop",
      "Asset and E2E gates before finished status",
    ],
  },
  {
    slug: "pactfall",
    title: "Pactfall",
    blurb: "Pyre-vs-Wardens MOBA built around the Pact.",
    status: "concept",
    faction: "Pyre vs Wardens",
    genre: "Lane Battle",
    courseAngle: "The disciplined-scope example: lane/champion fantasy without letting PvP swallow v1.",
    summary:
      "The Pact starts breaking in the lanes. Pactfall owns champion, objective, and jungle pressure so Starblight can stay orbital.",
    coverPath: "/images/games/pactfall.webp",
    demoUrl: "https://pactfall.vercel.app",
    deadrotUrl: "https://deadrot.com/games/pactfall",
    readinessIssueUrl: "https://github.com/shipshitgames/deadrot.com/issues/246",
    repoUrl: "https://github.com/shipshitgames/deadrot.com/tree/develop/apps/games/pactfall",
    proofPoints: [
      "Champion/ability model with constrained v1 scope",
      "Lane objective and Scourge pressure",
      "Multiplayer deferred until offline/local loop is finished",
    ],
  },
  {
    slug: "starblight",
    title: "Starblight",
    blurb: "Arcade pilot shooter against the orbital infection.",
    status: "prototype",
    faction: "Orbital Front",
    genre: "Arcade Shooter",
    courseAngle: "A board-hygiene case study: lock the genre, cut MOBA drift, finish the run loop.",
    summary:
      "A momentum-heavy orbital shooter where pilots carve through Scourge infection above the planet instead of getting dragged into lane/MOBA scope.",
    coverPath: "/images/games/starblight.webp",
    demoUrl: "https://starblight.vercel.app",
    deadrotUrl: "https://deadrot.com/games/starblight",
    readinessIssueUrl: "https://github.com/shipshitgames/deadrot.com/issues/247",
    repoUrl: "https://github.com/shipshitgames/deadrot.com/tree/develop/apps/games/starblight",
    proofPoints: [
      "Orbital shooter direction locked on the Deadrot board",
      "MOBA/lane scope deferred into Pactfall/Bloodlane",
      "Flight, combat, boss, and E2E completion gates",
    ],
  },
  {
    slug: "redline",
    title: "Redline",
    blurb: "High-speed courier runner through a burning Deadrot route.",
    status: "prototype",
    faction: "Pyre",
    genre: "Courier Runner",
    courseAngle: "A compact proof for feel tuning, speed readability, checkpoints, and juice.",
    summary:
      "A Pyre courier run built around speed, hazards, checkpoints, and the moment a prototype becomes something players can actually finish.",
    coverPath: "/images/games/redline.webp",
    demoUrl: "https://redline-eight-theta.vercel.app",
    deadrotUrl: "https://deadrot.com/games/redline",
    readinessIssueUrl: "https://github.com/shipshitgames/deadrot.com/issues/244",
    repoUrl: "https://github.com/shipshitgames/deadrot.com/tree/develop/apps/games/redline",
    proofPoints: [
      "One complete course with fail/finish/restart",
      "Speed, hazard, checkpoint, and crash feedback",
      "Desktop/mobile journey before finished status",
    ],
  },
  {
    slug: "rothulk",
    title: "Rothulk",
    blurb: "Side-scrolling infiltration inside a living Scourge bio-ship.",
    status: "prototype",
    faction: "Scourge",
    genre: "Platform Infiltration",
    courseAngle: "The platformer-feel case study: movement, collision, hazards, and one finished level.",
    summary:
      "A bio-ship infiltration platformer where the first job is not a huge campaign; it is one nasty level that feels finished.",
    coverPath: "/images/games/rothulk.webp",
    demoUrl: "https://rothulk.vercel.app",
    deadrotUrl: "https://deadrot.com/games/rothulk",
    readinessIssueUrl: "https://github.com/shipshitgames/deadrot.com/issues/245",
    repoUrl: "https://github.com/shipshitgames/deadrot.com/tree/develop/apps/games/rothulk",
    proofPoints: [
      "Traversal, hazard, HP, and ignite loop",
      "One complete level before campaign scope",
      "Platform feel checked across desktop and mobile",
    ],
  },
  {
    slug: "warline",
    title: "Warline",
    blurb: "Persistent strategy front for the Deadrot war.",
    status: "playable",
    faction: "The Front",
    genre: "Strategy Hub",
    courseAngle: "The meta-layer proof: operation contracts, live/fallback state, and product framing.",
    summary:
      "The persistent war board tying the browser games together: hold lanes, spend resources, read the front, and make Deadrot feel like one war.",
    coverPath: "/images/hero.webp",
    demoUrl: "https://warline-jet.vercel.app",
    deadrotUrl: "https://deadrot.com/warline",
    readinessIssueUrl: "https://github.com/shipshitgames/deadrot.com/issues/248",
    repoUrl: "https://github.com/shipshitgames/deadrot.com/tree/develop/apps/games/warline",
    proofPoints: [
      "Strategy front loop with visible operation feedback",
      "Offline/live mode clarity",
      "Catalog and E2E parity with the game apps",
    ],
  },
];

/** Studio subscription sold through Stripe and managed in app.shipshit.games. */
export const STUDIO_PASS = {
  name: "Skills Pro Studio Pass",
  shortName: "Studio Pass",
  productKey: "studio-pass",
  stripeProductMetadataKey: "studio_pass",
  tagline: "Skills Pro, member assets, build breakdowns, and live studio workflows.",
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
  "Monthly access to member asset packs, prompt packs, and production notes as they ship.",
  "Subscriber build breakdowns showing how DEADROT gets scoped, generated, reviewed, and shipped.",
  "Member community access is included when the private community opens; early subscribers keep their founder seat.",
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
