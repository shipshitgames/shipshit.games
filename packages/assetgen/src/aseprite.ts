// aseprite — parse an Aseprite / LibreSprite sprite-sheet JSON ("Output > JSON
// Data") into a normalized, render-agnostic description: an ordered list of
// frame rects + per-frame durations, plus tag-derived clips (clip name, optional
// facing, and the frame sequence implied by the tag's direction). This is the
// round-trip seam from issue #78: AI frames → hand-edit in Aseprite → back into
// the same `sprite-anim` pipeline the `expand` path produces.
//
// Pure data shaping — NO image IO — so it unit-tests against fixture JSON with no
// PNG. `import-aseprite.ts` consumes this to crop, (optionally) re-pixelize, pack,
// and write the manifest entry.

/** A packed cell rect inside the sheet image (Aseprite `frame`/`spriteSourceSize`). */
export interface AsepriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One frame entry from the Aseprite JSON (`frames` array element or hash value). */
export interface AsepriteFrame {
  filename?: string;
  frame: AsepriteRect;
  rotated?: boolean;
  trimmed?: boolean;
  spriteSourceSize?: AsepriteRect;
  sourceSize?: { w: number; h: number };
  /** Per-frame hold time in milliseconds. */
  duration?: number;
}

/** Aseprite tag playback directions. */
export type AsepriteDirection = "forward" | "reverse" | "pingpong" | "pingpong_reverse";

/** A frame tag — the clip boundary (`from`/`to` are frame indices, inclusive). */
export interface AsepriteFrameTag {
  name: string;
  from: number;
  to: number;
  direction?: AsepriteDirection | string;
  repeat?: string;
  color?: string;
}

export interface AsepriteMeta {
  app?: string;
  version?: string;
  image?: string;
  format?: string;
  size?: { w: number; h: number };
  scale?: string;
  frameTags?: AsepriteFrameTag[];
}

/** The top-level Aseprite JSON document. `frames` is an array OR a filename-keyed hash. */
export interface AsepriteDoc {
  frames: Record<string, AsepriteFrame> | AsepriteFrame[];
  meta?: AsepriteMeta;
}

/** A normalized frame: its sheet rect + a guaranteed positive duration (ms). */
export interface NormalizedFrame {
  rect: AsepriteRect;
  duration: number;
}

/** A single (clip, facing) animation sequence, frames already expanded by direction. */
export interface ParsedClip {
  name: string;
  facing: string;
  /** Ordered references into `frames`, one per played frame (pingpong already unrolled). */
  frames: Array<{ frameIndex: number; duration: number }>;
}

export interface ParsedAseprite {
  frames: NormalizedFrame[];
  clips: ParsedClip[];
  image?: string;
  size?: { w: number; h: number };
}

/** Default per-frame hold when the export omits/zeroes a duration (Aseprite default is 100ms). */
const DEFAULT_FRAME_MS = 100;

/**
 * Facing aliases accepted as a tag-name suffix (e.g. `run_west`, `idle_se`).
 * Deliberately EXCLUDES single letters and up/down/left/right so common clip
 * names ("power_up", "cast_e") are never mis-split into a facing.
 */
const FACING_ALIASES: Record<string, string> = {
  south: "south",
  southwest: "southwest",
  sw: "southwest",
  west: "west",
  northwest: "northwest",
  nw: "northwest",
  north: "north",
  northeast: "northeast",
  ne: "northeast",
  east: "east",
  southeast: "southeast",
  se: "southeast",
};

/** Canonical 8-way facing order (mirrors expand's DIRECTIONS[8]); used to sort the sheet's facings. */
export const FACING_ORDER = [
  "south",
  "southwest",
  "west",
  "northwest",
  "north",
  "northeast",
  "east",
  "southeast",
];

/** Tag-name separators tried (longest first) when splitting `<clip><sep><facing>`. */
const NAME_SEPARATORS = ["__", "::", ":", "/", "-", "_", "."];

/** Lowercase + kebab-sanitize a clip name the same way expand's `parseActions` does. */
export function sanitizeClipName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Split a tag name into `{ clip, facing }`. If the trailing segment after a
 * separator is a recognized facing, it is peeled off; otherwise the whole name
 * is the clip and the facing defaults to "south".
 */
export function splitTagName(name: string): { clip: string; facing: string } {
  const lower = name.trim().toLowerCase();
  for (const sep of NAME_SEPARATORS) {
    const idx = lower.lastIndexOf(sep);
    if (idx > 0 && idx + sep.length < lower.length) {
      const tail = lower.slice(idx + sep.length);
      const facing = FACING_ALIASES[tail];
      if (facing) {
        const clip = sanitizeClipName(lower.slice(0, idx));
        if (clip) return { clip, facing };
      }
    }
  }
  return { clip: sanitizeClipName(lower), facing: "south" };
}

/** Normalize the `frames` array/hash into an ordered list with valid rects + durations. */
export function normalizeFrames(frames: AsepriteDoc["frames"]): NormalizedFrame[] {
  const list = Array.isArray(frames) ? frames : Object.values(frames ?? {});
  return list.map((frame, i) => {
    const raw = frame?.frame;
    if (
      !raw ||
      ![raw.x, raw.y, raw.w, raw.h].every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      throw new Error(`aseprite frame ${i} is missing a valid {x,y,w,h} frame rect`);
    }
    // Floor to integers (like the tag from/to path) so a fractional rect from a
    // hand-edited/tool-mangled JSON can't slip past the importer's bounds check and
    // hit sharp.extract's cryptic "Expected integer for left" error mid-pack. Validate
    // AFTER flooring so a sub-pixel size (w: 0.5 -> 0) is caught here, not by sharp.
    const rect = { x: Math.floor(raw.x), y: Math.floor(raw.y), w: Math.floor(raw.w), h: Math.floor(raw.h) };
    if (rect.w <= 0 || rect.h <= 0) {
      throw new Error(`aseprite frame ${i} has a non-positive size (${rect.w}x${rect.h})`);
    }
    const ms = frame.duration;
    const duration = typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? Math.round(ms) : DEFAULT_FRAME_MS;
    return { rect, duration };
  });
}

const clampIndex = (n: number, max: number): number => Math.max(0, Math.min(max, Math.floor(n)));

/** Unroll a tag into a played frame sequence, honoring forward/reverse/pingpong. */
export function expandTagFrames(
  tag: AsepriteFrameTag,
  frames: NormalizedFrame[],
): Array<{ frameIndex: number; duration: number }> {
  if (frames.length === 0) return [];
  const last = frames.length - 1;
  const from = clampIndex(tag.from ?? 0, last);
  const to = clampIndex(tag.to ?? last, last);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const base: number[] = [];
  for (let i = lo; i <= hi; i++) base.push(i);

  const dir = String(tag.direction ?? "forward").toLowerCase();
  let seq: number[];
  if (dir === "reverse") {
    seq = [...base].reverse();
  } else if (dir === "pingpong") {
    seq = base.length > 1 ? [...base, ...base.slice(1, -1).reverse()] : base;
  } else if (dir === "pingpong_reverse") {
    const rev = [...base].reverse();
    seq = rev.length > 1 ? [...rev, ...rev.slice(1, -1).reverse()] : rev;
  } else {
    seq = base;
  }
  return seq.map((frameIndex) => ({ frameIndex, duration: frames[frameIndex]!.duration }));
}

/**
 * Parse an Aseprite doc into normalized frames + clips. With no `frameTags`, the
 * whole sheet becomes one clip (named from `opts.defaultClip`, default "idle").
 */
export function parseAseprite(doc: AsepriteDoc, opts: { defaultClip?: string } = {}): ParsedAseprite {
  if (!doc || typeof doc !== "object" || doc.frames === undefined) {
    throw new Error("aseprite doc is missing a `frames` array/object");
  }
  const frames = normalizeFrames(doc.frames);
  if (frames.length === 0) throw new Error("aseprite doc has no frames");

  const fallbackClip = sanitizeClipName(opts.defaultClip || "idle") || "idle";
  const tags = doc.meta?.frameTags ?? [];
  const clips: ParsedClip[] = [];

  if (tags.length === 0) {
    clips.push({
      name: fallbackClip,
      facing: "south",
      frames: frames.map((frame, i) => ({ frameIndex: i, duration: frame.duration })),
    });
  } else {
    for (const tag of tags) {
      const split = splitTagName(tag.name ?? "");
      const seq = expandTagFrames(tag, frames);
      if (seq.length === 0) continue;
      clips.push({ name: split.clip || fallbackClip, facing: split.facing, frames: seq });
    }
  }

  if (clips.length === 0) throw new Error("aseprite doc produced no clips");
  return { frames, clips, image: doc.meta?.image, size: doc.meta?.size };
}
