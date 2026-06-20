// pixelize-opts — pure, dependency-free option types + validators for the pixelize
// cutout/palette controls (issue #66). MUST stay free of `sharp` (and any heavy or
// native dep): apps/desktop imports THIS module into its Electron bundle to build the
// `studio:pixelize` CLI args, exactly like models-catalog stays bundle-safe. The
// sharp-backed pixelize() and the name→ramp registry live in pixelize.ts.

/** Cutout backend selector. "auto" prefers rembg, falling back to the flood-fill. */
export type CutoutMode = "auto" | "rembg" | "flood" | "none";

export const CUTOUT_MODES: readonly CutoutMode[] = ["auto", "rembg", "flood", "none"];

/** CLI/studio default: prefer rembg when installed, else the flood-fill. */
export const DEFAULT_CUTOUT_MODE: CutoutMode = "auto";

/** Coerce arbitrary input to a supported cutout mode; anything unknown → the default. */
export function normalizeCutoutMode(raw: unknown): CutoutMode {
  const value = String(raw ?? "").toLowerCase();
  return (CUTOUT_MODES as readonly string[]).includes(value) ? (value as CutoutMode) : DEFAULT_CUTOUT_MODE;
}

/** Palette names the grid can lock to. DOOM is the house ramp (and the only one today). */
export const PIXELIZE_PALETTE_NAMES = ["doom"] as const;
export type PixelizePaletteName = (typeof PIXELIZE_PALETTE_NAMES)[number];
export const DEFAULT_PIXELIZE_PALETTE: PixelizePaletteName = "doom";

export function isKnownPalette(raw: unknown): boolean {
  return (PIXELIZE_PALETTE_NAMES as readonly string[]).includes(String(raw ?? "").toLowerCase());
}

/** Coerce arbitrary input to a known palette name; anything unknown → the default. */
export function normalizePaletteName(raw: unknown): PixelizePaletteName {
  const value = String(raw ?? "").toLowerCase();
  return (PIXELIZE_PALETTE_NAMES as readonly string[]).includes(value)
    ? (value as PixelizePaletteName)
    : DEFAULT_PIXELIZE_PALETTE;
}

// Grid-height bounds — this is a sprite grid (rank-and-file ~110, boss ~180), so
// clamp wild input rather than forwarding a 0/NaN/40000 to sharp's resize.
export const PIXELIZE_HEIGHT_MIN = 16;
export const PIXELIZE_HEIGHT_MAX = 512;
export const DEFAULT_PIXELIZE_HEIGHT = 110;

export function clampHeight(raw: unknown, def: number = DEFAULT_PIXELIZE_HEIGHT): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return def;
  return Math.max(PIXELIZE_HEIGHT_MIN, Math.min(PIXELIZE_HEIGHT_MAX, n));
}

export const DEFAULT_BG_THRESHOLD = 42;

export function clampBgThreshold(raw: unknown, def: number = DEFAULT_BG_THRESHOLD): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return def;
  return Math.max(0, Math.min(255, n));
}
