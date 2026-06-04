/**
 * @shipshitgames/warline — game → operation contract (spec §4).
 *
 * Each Ship Shit Game maps to exactly one OperationKind. The reducer
 * (src/reducer.ts) reads operationKindFor / GAME_OPERATIONS to resolve effects.
 */

import type { GameSlug, OperationKind, ResourceKind } from "./types";

export interface GameOperationMeta {
  game: GameSlug;
  kind: OperationKind;
  label: string; // e.g. "Purge a Breach"
  verb: string; // e.g. "purged"
  blurb: string; // one line of what it does to the front
  resources: ResourceKind[]; // what it primarily credits
}

export const GAME_OPERATIONS: Record<GameSlug, GameOperationMeta> = {
  "scourge-survivors": {
    game: "scourge-survivors",
    kind: "purge-breach",
    label: "Purge a Breach",
    verb: "purged",
    blurb: "Burn down the hottest active breach and cool its region.",
    resources: ["biomass", "intel"],
  },
  deadlane: {
    game: "deadlane",
    kind: "hold-lane",
    label: "Hold the Lane",
    verb: "held",
    blurb: "Choke a Scourge supply lane and fortify its endpoints.",
    resources: ["scrap", "fuel"],
  },
  pactfall: {
    game: "pactfall",
    kind: "contest-territory",
    label: "Contest Territory",
    verb: "claimed",
    blurb: "Seize a contested neutral region for the Pact.",
    resources: ["intel"],
  },
  starblight: {
    game: "starblight",
    kind: "orbital-intercept",
    label: "Orbital Intercept",
    verb: "intercepted",
    blurb: "Strike from orbit — bleed every breach and the worst region.",
    resources: ["fuel", "intel"],
  },
  redline: {
    game: "redline",
    kind: "run-logistics",
    label: "Run Logistics",
    verb: "delivered",
    blurb: "Push convoys through to muster the Pact war effort.",
    resources: ["scrap", "fuel"],
  },
  rothulk: {
    game: "rothulk",
    kind: "sabotage",
    label: "Sabotage a Breach",
    verb: "sabotaged",
    blurb: "Cripple the hottest breach and harden its region.",
    resources: ["biomass"],
  },
};

/** The OperationKind a given game reports. */
export function operationKindFor(game: GameSlug): OperationKind {
  return GAME_OPERATIONS[game].kind;
}
