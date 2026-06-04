/**
 * @shipshitgames/warline — pure core barrel (spec §9).
 *
 * Re-exports types, constants, map, operations, reducer, commands, summary.
 * Deliberately does NOT export ./client (browser-only, depends on partysocket)
 * so this entry stays dependency-free and safe to import on the edge server.
 */

// types + constants (spec §1, §2)
export type {
  HumanFaction,
  Faction,
  ResourceKind,
  ResourceBag,
  GameSlug,
  OperationKind,
  Region,
  Breach,
  Lane,
  WarEvent,
  WorldState,
  OperationResult,
  Command,
  CommandKind,
  Summary,
} from "./types";
export {
  SCHEMA_VERSION,
  RESOURCE_KINDS,
  FEED_MAX,
  TICK_MS,
  ECON,
  TICK,
  COMMAND_COSTS,
  COMMAND_EFFECT,
} from "./types";

// map (spec §3)
export {
  createInitialWorld,
  regionById,
  laneById,
  breachById,
  neighborsOf,
  clamp,
} from "./map";

// operations (spec §4)
export type { GameOperationMeta } from "./operations";
export { GAME_OPERATIONS, operationKindFor } from "./operations";

// reducer (spec §5)
export type { ApplyResult } from "./reducer";
export {
  applyOperation,
  tick,
  resetWorld,
  makeEventId,
  magnitude,
} from "./reducer";

// commands (spec §6)
export type { CommandResult } from "./commands";
export { canAfford, applyCommand } from "./commands";

// summary (spec §7)
export { summarize } from "./summary";
