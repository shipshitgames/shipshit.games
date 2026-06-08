// Asset-gen style is GENERATED from DESIGN.md (the `assetgen:` block) + the
// art bible. Run `bun assetgen tokens` to regenerate ./style.generated.ts.
// Edit the bible, not these constants. This module just re-exports the generated
// canon (+ a couple of CLI-only human labels) so existing imports keep working.
export {
  ART_BIBLE,
  STYLE_SUFFIX,
  NEGATIVE_PROMPTS,
  GAME_FRAMING,
  ASSET_TYPE_DIRECTION,
  KIND_MAP,
  REFERENCE_SLOTS,
  SCOURGE_RULE,
  GRADE_PARAMS,
  STYLE_REF,
  PROVIDER_SETTINGS,
  buildPrompt,
} from "./style.generated.ts";

import { STYLE_SUFFIX } from "./style.generated.ts";

/** @deprecated Use STYLE_SUFFIX — kept as an alias for older imports. */
export const DOOM_SUFFIX = STYLE_SUFFIX;

// Short human label per game view — CLI help + the studio matrix view only.
// Not canon, not generated (no asset-gen meaning); lives here by hand.
export const GAME_VIEW: Record<string, string> = {
  "scourge-survivors": "FPS billboard",
  deadlane: "TD top-down",
  pactfall: "MOBA iso",
  starblight: "arcade",
  redline: "runner side-on",
  rothulk: "platformer side-on",
};
