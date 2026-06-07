// Asset-gen style is GENERATED from lore/DESIGN.md (the `assetgen:` block) + the
// lore Style-Bible. Run `bun assetgen tokens` to regenerate ./style.generated.ts.
// Edit the bible, not these constants. This module just re-exports the generated
// canon (+ a couple of CLI-only human labels) so existing imports keep working.
export {
  STYLE_SUFFIX,
  PALETTE_LINE,
  NEGATIVE_PROMPTS,
  GAME_FRAMING,
  KIND_MAP,
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
