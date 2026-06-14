// import-aseprite — round-trip a hand-authored Aseprite / LibreSprite sprite
// sheet back into the SAME `sprite-anim` format that `expand` emits (issue #78).
// The AI path (`expand`) grows one origin into a directional set; an artist then
// hand-edits those frames in Aseprite and exports "Output > JSON Data". THIS reads
// that PNG + JSON, crops each tagged frame, (optionally) re-pixelizes it onto the
// DOOM grid, packs the frames into the same edge-extruded atlas page(s), and writes
// a `sprite-anim` manifest entry that is indistinguishable in FORMAT from one the
// `expand` path produces — same sheet schema, same AssetEntry keys, same preview.
//
// The seam is `aseprite.ts` (pure JSON parsing, no image IO); this module owns the
// pixels. It deliberately reuses expand's exported `frameId`, `clipLoops`,
// `gradeFrame`, `SPRITE_ANIM_VERSION`, types, and `animPreviewHtml` so the two
// paths can never drift apart in format.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";

import { packFrameBuffers } from "./atlas.ts";
import type { AtlasPage } from "./atlas.ts";
import { FACING_ORDER, parseAseprite } from "./aseprite.ts";
import type { AsepriteDoc, ParsedClip } from "./aseprite.ts";
import {
  SPRITE_ANIM_VERSION,
  animPreviewHtml,
  clipLoops,
  frameId,
  gradeFrame,
} from "./expand.ts";
import type { Anchor, AnimClip, AnimFrame, SpriteAnimSheet } from "./expand.ts";
import { register } from "./manifest.ts";
import type { AssetEntry, AssetLicenseRecord } from "./manifest.ts";
import { licenseForGeneration, withUsageAccounting } from "./pipeline.ts";

/** Default grid height when `--pixelize` is set without an explicit `--height` (mirrors pixelize's default). */
const DEFAULT_GRID_HEIGHT = 110;
/** Fallback fps when timing cannot be derived (mirrors expand's fps clamp floor). */
const DEFAULT_FPS = 8;

export interface ImportAsepriteOptions {
  id: string;
  game: string;
  /** Path to the source sprite-sheet PNG (Aseprite `meta.image`). */
  sheetPath: string;
  /** Path to the Aseprite "Output > JSON Data" file (used when `doc` is not injected). */
  jsonPath?: string;
  /** Injected, already-parsed Aseprite doc (skips reading `jsonPath`). */
  doc?: AsepriteDoc;
  /** Injected source-sheet bytes (skips reading `sheetPath`). */
  sheetData?: Buffer;
  /** Clip name to use when the sheet has no frame tags. */
  defaultClip?: string;
  /** Re-grade each cropped frame onto the DOOM grid (cutout + palette lock). */
  pixelize?: boolean;
  /** Target grid height for `--pixelize`. */
  height?: number;
  anchor: Anchor;
  scale: number;
  /** Force a uniform fps (and uniform per-frame durations); otherwise timing is taken from the Aseprite frames. */
  fps?: number;
  /** Provenance tool recorded on the sheet + license (default "aseprite"). */
  provider?: string;
  model?: string;
  outputRoot: string;
  manifestPath?: string;
  usageLogPath?: string | null;
  /** License disclosure `type` (default "hand-authored"). */
  licenseType?: string;
  licenseTerms?: string;
  licenseUrl?: string;
  padding?: number;
  /** Pack + assemble in memory only; skip disk writes + manifest registration. */
  dryRun?: boolean;
  /** Injectable clock so license/generatedAt are deterministic in tests. */
  now?: () => Date;
  log?: (chunk: string) => void;
}

export interface ImportAsepriteResult {
  id: string;
  written: boolean;
  outputPath?: string;
  relPath: string;
  manifestPath: string;
  animPath?: string;
  animRelPath: string;
  previewRelPath: string;
  pages: AtlasPage[];
  frameCount: number;
  entry: AssetEntry;
  sheet: SpriteAnimSheet;
}

/** Order a set of facings by the canonical 8-way order, with any unknown facings appended (sorted). */
function orderFacings(facings: Set<string>): string[] {
  const known = FACING_ORDER.filter((facing) => facings.has(facing));
  const extras = [...facings].filter((facing) => !FACING_ORDER.includes(facing)).sort();
  return [...known, ...extras];
}

/** Derive an fps from per-frame hold times: 1000 / median(ms), clamped to >= 1. */
function deriveFps(durationsMs: number[]): number {
  if (durationsMs.length === 0) return DEFAULT_FPS;
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  return Math.max(1, Math.round(1000 / Math.max(1, median)));
}

interface ClipGroup {
  loop: boolean;
  /** facing -> the played frame sequence (frameIndex + duration), in play order. */
  facings: Map<string, ParsedClip["frames"]>;
}

/**
 * Import a hand-authored Aseprite sheet into a `sprite-anim` manifest entry that
 * matches `expand`'s output format. Frames are cropped from the source PNG by the
 * rects in the JSON, optionally re-graded, packed, and written with the shared
 * preview + manifest path.
 */
export async function importAseprite(opts: ImportAsepriteOptions): Promise<ImportAsepriteResult> {
  const log = opts.log ?? (() => {});
  const padding = opts.padding ?? 2;
  const provider = opts.provider || "aseprite";
  const model = opts.model;
  const height = opts.height && opts.height > 0 ? Math.floor(opts.height) : DEFAULT_GRID_HEIGHT;

  // Load the source sheet bytes (injectable for tests) and validate it is a real image.
  let sheetData = opts.sheetData;
  if (!sheetData) {
    if (!existsSync(opts.sheetPath)) throw new Error(`aseprite sheet image not found: ${opts.sheetPath}`);
    sheetData = await readFile(opts.sheetPath);
  }
  const sheetMeta = await sharp(sheetData).metadata();
  const imgW = sheetMeta.width ?? 0;
  const imgH = sheetMeta.height ?? 0;
  if (!imgW || !imgH) throw new Error(`aseprite sheet is not a readable image: ${opts.sheetPath}`);

  // Load + parse the JSON doc (injectable for tests).
  let doc = opts.doc;
  if (!doc) {
    if (!opts.jsonPath) throw new Error("import-aseprite requires a `jsonPath` (or an injected `doc`)");
    if (!existsSync(opts.jsonPath)) throw new Error(`aseprite json not found: ${opts.jsonPath}`);
    doc = JSON.parse(await readFile(opts.jsonPath, "utf8")) as AsepriteDoc;
  }
  const parsed = parseAseprite(doc, { defaultClip: opts.defaultClip });

  // Every referenced rect must fit inside the sheet; a bad export should fail loudly
  // here rather than letting sharp throw a cryptic extract_area error mid-pack.
  parsed.frames.forEach((frame, i) => {
    const { x, y, w, h } = frame.rect;
    if (x < 0 || y < 0 || x + w > imgW || y + h > imgH) {
      throw new Error(`aseprite frame ${i} rect ${x},${y} ${w}x${h} falls outside the ${imgW}x${imgH} sheet`);
    }
  });

  const relPath = `sprites/${opts.id}.anim0.webp`;
  const animRelPath = `sprites/${opts.id}.anim.json`;
  const previewRelPath = `previews/${opts.id}-anim.html`;
  const manifestPath = opts.manifestPath ?? join(opts.outputRoot, "assets.json");
  let outputPath: string | undefined;

  // Group parsed (clip, facing) sequences into one clip per name, preserving the
  // first-seen clip order; a repeated (clip, facing) appends onto the sequence.
  const groups = new Map<string, ClipGroup>();
  const clipOrder: string[] = [];
  for (const clip of parsed.clips) {
    let group = groups.get(clip.name);
    if (!group) {
      group = { loop: clipLoops(clip.name), facings: new Map() };
      groups.set(clip.name, group);
      clipOrder.push(clip.name);
    }
    const prev = group.facings.get(clip.facing);
    group.facings.set(clip.facing, prev ? [...prev, ...clip.frames] : clip.frames);
  }

  const allFacings = new Set<string>();
  for (const group of groups.values()) for (const facing of group.facings.keys()) allFacings.add(facing);
  const directions = orderFacings(allFacings);

  // Forced fps -> uniform per-frame durations (exactly like expand); otherwise the
  // Aseprite per-frame hold times drive both the durations and the derived fps.
  const overrideFps = opts.fps && opts.fps > 0 ? Math.max(1, Math.floor(opts.fps)) : undefined;
  const uniformDuration = overrideFps ? Math.max(1, Math.round(1000 / overrideFps)) : undefined;
  const durationFor = (ms: number): number => uniformDuration ?? Math.max(1, Math.round(ms));

  const summaryPrompt = `import ${opts.id} from aseprite: clips ${clipOrder
    .map((name) => `${name}(${groups.get(name)!.facings.size}d)`)
    .join(", ")}; ${directions.length} dir(s) ${directions.join("/")}; from ${opts.sheetPath}`;

  return withUsageAccounting<ImportAsepriteResult>(
    {
      usageLogPath: opts.usageLogPath,
      log,
      logStyle: "stream",
      event: () => ({
        command: "import",
        provider,
        kind: "sprite-anim",
        game: opts.game,
        id: opts.id,
        model,
        outputPath,
        prompt: summaryPrompt,
      }),
    },
    async () => {
      // 1. crop each played frame from the sheet (cache by frameIndex so a frame
      //    reused by a pingpong tag is decoded once), optionally re-grading it.
      const cropCache = new Map<number, Buffer>();
      const cropFrame = async (frameIndex: number): Promise<Buffer> => {
        const cached = cropCache.get(frameIndex);
        if (cached) return cached;
        const rect = parsed.frames[frameIndex]!.rect;
        const extracted = await sharp(sheetData)
          .extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h })
          .ensureAlpha()
          .webp({ lossless: true })
          .toBuffer();
        const data = opts.pixelize ? await gradeFrame(extracted, height) : extracted;
        cropCache.set(frameIndex, data);
        return data;
      };

      // 2. build the pack inputs in a deterministic (clip, facing, index) order,
      //    using the same frame-id scheme expand uses so the layout matches.
      const frameInputs: { id: string; data: Buffer }[] = [];
      for (const name of clipOrder) {
        const group = groups.get(name)!;
        for (const facing of directions) {
          const seq = group.facings.get(facing);
          if (!seq) continue;
          for (let i = 0; i < seq.length; i++) {
            frameInputs.push({ id: frameId(name, facing, i), data: await cropFrame(seq[i]!.frameIndex) });
          }
        }
      }
      log(`[import] cropped ${frameInputs.length} frame(s) from ${imgW}x${imgH} sheet\n`);

      // 3. pack into edge-extruded atlas page(s).
      const packed = await packFrameBuffers(frameInputs, { padding });
      const pages: AtlasPage[] = packed.pageDims.map((dims, i) => ({
        image: `${opts.id}.anim${i}.webp`,
        width: dims.width,
        height: dims.height,
      }));
      const rectById = new Map(packed.frames.map((frame) => [frame.id, frame]));

      // 4. assemble the clip -> facing -> frame-rect map. expand fills EVERY clip
      //    with EVERY facing in `directions`, each holding exactly `clip.frames`
      //    rects (expand.ts) — so a consumer can trust `clip.frames` as the per-
      //    facing length for any facing. Hand-authored sheets are ragged (a clip
      //    tagged for one facing, or with uneven frame counts), so we DENSIFY to
      //    that same contract: a facing the clip never authored reuses a fallback
      //    facing (south, else the first authored one); a facing shorter than the
      //    clip's longest holds its last frame. Only real frames are packed — the
      //    held/fallback slots just re-reference an existing atlas rect, no bloat.
      const clips: Record<string, AnimClip> = {};
      for (const name of clipOrder) {
        const group = groups.get(name)!;
        let frameLen = 0;
        for (const seq of group.facings.values()) frameLen = Math.max(frameLen, seq.length);
        const fallbackFacing = group.facings.has("south")
          ? "south"
          : directions.find((facing) => group.facings.has(facing))!;

        const clipDirections: Record<string, AnimFrame[]> = {};
        for (const facing of directions) {
          const sourceFacing = group.facings.has(facing) ? facing : fallbackFacing;
          const seq = group.facings.get(sourceFacing)!;
          clipDirections[facing] = Array.from({ length: frameLen }, (_unused, i) => {
            const srcIndex = Math.min(i, seq.length - 1); // hold the last frame when padding
            const rect = rectById.get(frameId(name, sourceFacing, srcIndex))!;
            return { page: rect.page, x: rect.x, y: rect.y, w: rect.w, h: rect.h, duration: durationFor(seq[srcIndex]!.duration) };
          });
        }
        clips[name] = { loop: group.loop, frames: frameLen, directions: clipDirections };
      }

      const playedDurations: number[] = [];
      for (const group of groups.values()) for (const seq of group.facings.values()) for (const frame of seq) playedDurations.push(durationFor(frame.duration));
      const fps = overrideFps ?? deriveFps(playedDurations);

      const stamp = opts.now?.() ?? new Date();
      const sheet: SpriteAnimSheet = {
        version: SPRITE_ANIM_VERSION,
        id: opts.id,
        game: opts.game,
        origin: opts.sheetPath,
        provider,
        ...(model ? { model } : {}),
        fps,
        padding: packed.padding,
        anchor: opts.anchor,
        scale: opts.scale,
        directions,
        pages,
        clips,
        frameCount: packed.frames.length,
      };

      const frameSize: [number, number] = [
        Math.max(...packed.frames.map((frame) => frame.w)),
        Math.max(...packed.frames.map((frame) => frame.h)),
      ];
      const license: AssetLicenseRecord = {
        ...licenseForGeneration({ provider, model, kind: "sprite-anim", date: stamp }),
        type: opts.licenseType || "hand-authored",
        terms: opts.licenseTerms || "hand-authored — review required before shipping",
        ...(opts.licenseUrl ? { url: opts.licenseUrl } : {}),
        generatedAt: stamp.toISOString(),
      };
      const entry: AssetEntry = {
        id: opts.id,
        kind: "sprite-anim",
        game: opts.game,
        path: relPath,
        prompt: summaryPrompt,
        provider,
        ...(model ? { model } : {}),
        dimensions: [Math.max(...pages.map((page) => page.width)), Math.max(...pages.map((page) => page.height))],
        frameSize,
        frames: packed.frames.length,
        fps,
        anchor: opts.anchor,
        scale: opts.scale,
        views: directions,
        clips: clipOrder,
        animation: animRelPath,
        origin: opts.sheetPath,
        preview: previewRelPath,
        license,
      };

      if (opts.dryRun) {
        log(`[import] dry-run: ${pages.length} page(s), ${packed.frames.length} frame(s); skipping writes\n`);
        return { id: opts.id, written: false, relPath, manifestPath, animRelPath, previewRelPath, pages, frameCount: packed.frames.length, entry, sheet };
      }

      // 5. write page images, the frame map, a preview, and register the entry —
      //    same on-disk layout the expand path produces.
      const spritesDir = join(opts.outputRoot, "sprites");
      await mkdir(spritesDir, { recursive: true });
      for (let i = 0; i < packed.images.length; i++) {
        const pagePath = join(spritesDir, `${opts.id}.anim${i}.webp`);
        await writeFile(pagePath, packed.images[i]!);
        log(`[wrote] ${pagePath} (${(packed.images[i]!.length / 1024).toFixed(1)} kb)\n`);
      }
      outputPath = join(spritesDir, `${opts.id}.anim0.webp`);

      const animPath = join(spritesDir, `${opts.id}.anim.json`);
      await writeFile(animPath, JSON.stringify(sheet, null, 2) + "\n");
      log(`[anim] ${animPath}\n`);

      const previewPath = join(opts.outputRoot, previewRelPath);
      await mkdir(dirname(previewPath), { recursive: true });
      await writeFile(previewPath, animPreviewHtml({ id: opts.id, game: opts.game, sheet, sheetDirHref: "../sprites" }), "utf8");
      log(`[preview] ${previewPath}\n`);

      await register(manifestPath, entry);
      log(`[manifest] ${manifestPath} updated\n`);

      return { id: opts.id, written: true, outputPath, relPath, manifestPath, animPath, animRelPath, previewRelPath, pages, frameCount: packed.frames.length, entry, sheet };
    },
  );
}
