import type { CSSProperties } from "react";

import type { AccentToken } from "@/lib/content/types";

/** Hex values mirrored from app/theme.css — needed where CSS vars can't reach (OG images). */
export const ACCENT_HEX: Record<AccentToken, string> = {
  blood: "#c1121f",
  hellfire: "#ff6a00",
  toxic: "#8bdc1f",
  rust: "#a35a33",
  bone: "#e9e3d6",
};

/** CSS var reference onto the theme.css token, e.g. `var(--color-hellfire)`. */
export function accentVar(accent: AccentToken): string {
  return `var(--color-${accent})`;
}

/**
 * Inline style that themes a subtree: `--accent` for borders/glows and
 * `--page-accent` so Eyebrow / text-glow / bloom-accent pick it up too.
 */
export function accentStyle(accent: AccentToken): CSSProperties {
  return {
    "--accent": accentVar(accent),
    "--page-accent": accentVar(accent),
  } as CSSProperties;
}

/**
 * Page-level accent: sets ONLY `--page-accent` (Eyebrow, text-glow, and the
 * marketing sections read this), deliberately NOT `--accent`. Game and faction
 * descendants — game-card.tsx, the bestiary, sprite-gallery — consume
 * `var(--accent)` and must keep theming themselves even when rendered inside an
 * accented home/assets section, so leaving `--accent` untouched keeps this
 * inert for them. Resolves to the same hex as the old raw-literal helpers
 * because `var(--color-${accent})` mirrors theme.css.
 */
export function pageAccent(accent: AccentToken): CSSProperties {
  return { "--page-accent": accentVar(accent) } as CSSProperties;
}
