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
    slug: "bloodlane",
    title: "Bloodlane",
    blurb: "Pyre-vs-Wardens MOBA.",
    status: "concept",
    repoUrl: "https://github.com/shipshitgames/bloodlane",
  },
];
