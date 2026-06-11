// Single place that turns Asset Lab requests into provider prompts. The assetgen
// art bible (generated from lore/DESIGN.md) is the source of truth for studio
// style; imported via the package's pure exports so no native deps tag along.
import { buildPrompt } from "@shipshitgames/assetgen/style";
import { spritePromptDirective } from "@shipshitgames/assetgen/sprite-prompt";

export const SHEET_POSES = ["idle", "attacking", "running", "jumping"] as const;

export interface SpritePromptInput {
  subject: string;
  /** Free-form character bible: anatomy, gear, colors — keeps renders consistent. */
  description?: string;
  gameSlug: string;
  pose?: string;
  /** Render a 1xN sheet of these poses instead of a single sprite. */
  sheetPoses?: readonly string[];
  /** Set when reprinting from a reference image. */
  fromReference?: boolean;
}

export function spritePrompt({
  subject,
  description,
  gameSlug,
  pose,
  sheetPoses,
  fromReference,
}: SpritePromptInput): string {
  const parts = [subject];
  if (description?.trim()) parts.push(`character design: ${description.trim()}`);
  if (sheetPoses?.length) {
    parts.push(
      spritePromptDirective([...sheetPoses], 1),
      "every cell shows the exact same character with identical design, colors, materials, and scale — only the pose changes",
    );
  } else if (pose) {
    parts.push(`${pose} pose`);
  }
  if (fromReference) {
    parts.push(
      "use the provided reference image as the exact same character: keep its design, colors, materials, proportions, and silhouette identical, only change the pose and angle",
    );
  }
  return buildPrompt({ prompt: parts.join(", "), game: gameSlug, kind: "sprite" });
}

/** Wide canvas for pose rows, square otherwise. */
export function aspectRatioFor(sheetPoses?: readonly string[]): string {
  return sheetPoses?.length ? "21:9" : "1:1";
}
