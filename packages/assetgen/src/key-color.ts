// key-color — palette-aware chroma-key selection (issue #115).
//
// The generated sprite pipeline keys a flat matte colour out of a render to make
// the background transparent. The matte MUST sit outside the subject's own
// palette: when a violet/bruised-purple flyer was generated on a magenta/purple
// matte, extraction left purple/white key residue and bled the key colour back
// into the sprite under runtime filtering (the winged-host failure). The fix is
// to pick a key colour that is far from every subject colour and to RESERVE that
// colour out of the subject — green is the conventional default, but a faction
// that uses toxic green as a subject colour must fall back to another key.
//
// Pure (no `sharp`/native deps) so API consumers (apps/api) and the prompt/build
// step can import the selection + the prompt directive without a native bundle —
// the same split `sprite-prompt.ts` uses. Image pixel work lives in
// `chroma-key.ts`.

export type RGB = readonly [number, number, number];

/**
 * Conventional chroma-key candidates in PREFERENCE order. Green first (the
 * studio/industry default), then magenta, blue, cyan as fallbacks. Selection
 * walks this order and takes the first candidate that is safe for the subject
 * palette, so a key-free subject still keys on green by default.
 */
export const KEY_CANDIDATES: ReadonlyArray<{ readonly name: string; readonly hex: string }> = [
  { name: "green", hex: "#00ff00" },
  { name: "magenta", hex: "#ff00ff" },
  { name: "blue", hex: "#0000ff" },
  { name: "cyan", hex: "#00ffff" },
];

/**
 * Minimum Euclidean RGB distance a key colour must keep from EVERY subject
 * colour to count as out-of-palette. 110 clears green against the studio DOOM
 * ramp (incl. Scourge toxic green, nearest ~147) so green stays the default,
 * while a subject that actually contains a near-key colour (a toxic-green
 * creature, a magenta-tinged flyer) pushes its distance under the bar and forces
 * the next candidate.
 */
export const KEY_SAFE_MIN_DISTANCE = 110;

/** Parse `#rgb`/`#rrggbb` (with or without `#`) into an RGB triple. Throws on malformed input. */
export function hexToRgb(hex: string): RGB {
  const raw = hex.trim().replace(/^#/, "");
  const full = raw.length === 3 ? raw.replace(/(.)/g, "$1$1") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`invalid hex colour: ${hex}`);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Render an RGB triple as a lowercase `#rrggbb` string. */
export function rgbToHex(rgb: RGB): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return "#" + rgb.map((v) => clamp(v).toString(16).padStart(2, "0")).join("");
}

/** Euclidean distance in RGB space — cheap, and good enough to separate keys from a subject palette. */
export function colorDistance(a: RGB, b: RGB): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export interface NearestColor {
  /** Closest subject swatch as `#rrggbb`, or null when the palette is empty. */
  hex: string | null;
  /** Distance to that swatch, or Infinity when the palette is empty. */
  distance: number;
}

/** The nearest subject palette colour to a key colour (and how far it is). */
export function nearestPaletteColor(key: RGB, palette: readonly string[]): NearestColor {
  let best: NearestColor = { hex: null, distance: Infinity };
  for (const swatch of palette) {
    let rgb: RGB;
    try {
      rgb = hexToRgb(swatch);
    } catch {
      continue;
    }
    const distance = colorDistance(key, rgb);
    if (distance < best.distance) best = { hex: rgbToHex(rgb), distance };
  }
  return best;
}

export interface KeyValidation {
  /** True when the key sits at least `minDistance` from every subject colour. */
  ok: boolean;
  keyHex: string;
  /** Nearest subject colour and its distance (the binding constraint). */
  nearestHex: string | null;
  distance: number;
  minDistance: number;
  /** Human-readable explanation suitable for a report or manifest. */
  reason: string;
}

/** Validate ONE key colour against a subject palette: is it far enough to be safe? */
export function validateKeyColor(opts: {
  keyHex: string;
  palette: readonly string[];
  minDistance?: number;
}): KeyValidation {
  const minDistance = opts.minDistance ?? KEY_SAFE_MIN_DISTANCE;
  const key = hexToRgb(opts.keyHex);
  const keyHex = rgbToHex(key);
  const near = nearestPaletteColor(key, opts.palette);
  const ok = near.distance >= minDistance;
  const reason = near.hex
    ? ok
      ? `${keyHex} is ${Math.round(near.distance)} from nearest subject colour ${near.hex} (≥ ${minDistance}) — out of palette`
      : `${keyHex} is only ${Math.round(near.distance)} from subject colour ${near.hex} (< ${minDistance}) — keying it risks subject residue/bleed`
    : `${keyHex} has no subject palette to clash with`;
  return { ok, keyHex, nearestHex: near.hex, distance: near.distance, minDistance, reason };
}

export interface KeyCandidateReport {
  name: string;
  hex: string;
  distance: number;
  nearestHex: string | null;
  safe: boolean;
}

export interface KeySelection {
  /** Chosen key as `#rrggbb`. */
  hex: string;
  /** Candidate name (`green`/`magenta`/…) or `custom` for a forced hex. */
  name: string;
  /** Distance from the chosen key to the nearest subject colour. */
  distance: number;
  nearestHex: string | null;
  /** True when the chosen key cleared `minDistance`. False only when nothing was safe. */
  safe: boolean;
  minDistance: number;
  /** Why this key was chosen (names the rejected candidates and distances). */
  reason: string;
  /** Per-candidate distances, in preference order — useful for `--json`/debugging. */
  candidates: KeyCandidateReport[];
}

const nameForHex = (hex: string): string => {
  const norm = hex.toLowerCase();
  return KEY_CANDIDATES.find((c) => c.hex === norm)?.name ?? "custom";
};

/**
 * Pick a chroma key that is OUT of the subject palette.
 *
 * - `prefer` (an explicit `--key`) is honoured when safe; when it clashes with
 *   the palette it is still returned but flagged `safe: false` with a reason, so
 *   the caller can refuse (or `--force`).
 * - Otherwise candidates are tried in preference order and the FIRST safe one
 *   wins (green stays the default). If none are safe — a pathological palette
 *   spanning every key — the farthest candidate is returned with `safe: false`.
 */
export function selectKeyColor(opts: {
  palette: readonly string[];
  prefer?: string;
  minDistance?: number;
}): KeySelection {
  const minDistance = opts.minDistance ?? KEY_SAFE_MIN_DISTANCE;

  const candidates: KeyCandidateReport[] = KEY_CANDIDATES.map((c) => {
    const near = nearestPaletteColor(hexToRgb(c.hex), opts.palette);
    return { name: c.name, hex: c.hex, distance: near.distance, nearestHex: near.hex, safe: near.distance >= minDistance };
  });

  const summarise = (skipped: KeyCandidateReport[]): string =>
    skipped.length
      ? ` rejected ${skipped.map((s) => `${s.name} (${Math.round(s.distance)}${s.nearestHex ? ` to ${s.nearestHex}` : ""})`).join(", ")};`
      : "";

  // Explicit preference: validate it, fall through to auto only implicitly via reason.
  if (opts.prefer) {
    const v = validateKeyColor({ keyHex: opts.prefer, palette: opts.palette, minDistance });
    return {
      hex: v.keyHex,
      name: nameForHex(v.keyHex),
      distance: v.distance,
      nearestHex: v.nearestHex,
      safe: v.ok,
      minDistance,
      reason: `requested ${v.keyHex}: ${v.reason}`,
      candidates,
    };
  }

  const firstSafeIndex = candidates.findIndex((c) => c.safe);
  if (firstSafeIndex >= 0) {
    const chosen = candidates[firstSafeIndex]!;
    const skipped = candidates.slice(0, firstSafeIndex);
    return {
      hex: chosen.hex,
      name: chosen.name,
      distance: chosen.distance,
      nearestHex: chosen.nearestHex,
      safe: true,
      minDistance,
      reason:
        `${chosen.name} (${chosen.hex}) selected: ${Math.round(chosen.distance)} from nearest subject colour` +
        `${chosen.nearestHex ? ` ${chosen.nearestHex}` : ""} (≥ ${minDistance}).${summarise(skipped)}`,
      candidates,
    };
  }

  // Nothing safe — take the farthest candidate and flag it.
  const farthest = candidates.reduce((a, b) => (b.distance > a.distance ? b : a));
  return {
    hex: farthest.hex,
    name: farthest.name,
    distance: farthest.distance,
    nearestHex: farthest.nearestHex,
    safe: false,
    minDistance,
    reason: `no key cleared ${minDistance}; farthest is ${farthest.name} (${Math.round(farthest.distance)}) — subject palette spans the key colours, expect residue`,
    candidates,
  };
}

/**
 * Prompt/build directive instructing the generator to render on a flat solid key
 * background and reserve that colour out of the subject — the upstream half of
 * palette-aware extraction. Pure so the prompt builder can fold it in without a
 * native dep. `keyName` is optional flavour for readability.
 */
export function flatKeyBackgroundDirective(keyHex: string, keyName?: string): string {
  const hex = rgbToHex(hexToRgb(keyHex));
  const label = keyName ? `${keyName} (${hex})` : hex;
  return [
    `flat solid ${label} background only`,
    "no gradients, shadows, glow, border, grid, or antialias halo against the key",
    `reserve ${hex} entirely out of the subject's own colours`,
  ].join("; ");
}
