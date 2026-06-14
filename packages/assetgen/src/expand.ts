// expand — grow ONE origin sprite into a full directional animation set (issue
// #71). For every (action × facing × frame) cell it synthesizes a frame through
// the shared provider abstraction (same matrix pattern as `assetgen matrix`),
// grades each frame onto the DOOM grid, packs them into edge-extruded atlas
// page(s) with the in-repo shelf packer, and writes a frame map + a `sprite-anim`
// manifest entry. The CI-verifiable path runs entirely on the keyless `mock`
// provider; method-conditioned img2img (controlnet/pixellab/animdrawings) is a
// documented follow-up that plugs into the same FrameGenerator seam.
//
// NOTE: the engine-runtime consumption of the frame map is sibling issue #72.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";

import { packFrameBuffers } from "./atlas.ts";
import type { AtlasPage } from "./atlas.ts";
import { register } from "./manifest.ts";
import type { AssetEntry, AssetLicenseRecord } from "./manifest.ts";
import { licenseForGeneration, withUsageAccounting } from "./pipeline.ts";
import { pixelize } from "./pixelize.ts";
import { generateAsset } from "./providers.ts";

export const SPRITE_ANIM_VERSION = 1;

/** Directional facings keyed by direction count. Order is load-bearing (frame map order). */
export const DIRECTIONS: Record<number, string[]> = {
  1: ["south"],
  4: ["south", "west", "north", "east"],
  8: ["south", "southwest", "west", "northwest", "north", "northeast", "east", "southeast"],
};

/** One-shot actions that should NOT loop (everything else loops by default). */
const ONE_SHOT_ACTIONS = new Set(["attack", "death", "die", "hurt", "hit", "cast", "jump", "spawn", "shoot"]);

export type Anchor = [number, number];

export interface ExpandAction {
  name: string;
  frames: number;
}

export interface AnimFrame {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Per-frame hold time in milliseconds (derived from fps). */
  duration: number;
}

export interface AnimClip {
  loop: boolean;
  frames: number;
  /** Frame rects keyed by facing, in frame-index order. */
  directions: Record<string, AnimFrame[]>;
}

export interface SpriteAnimSheet {
  version: number;
  id: string;
  game: string;
  origin: string;
  method?: string;
  provider: string;
  model?: string;
  fps: number;
  padding: number;
  anchor: Anchor;
  scale: number;
  directions: string[];
  pages: AtlasPage[];
  clips: Record<string, AnimClip>;
  frameCount: number;
}

/** Args handed to the per-frame synthesizer; the default impl calls a provider. */
export interface FrameGeneratorArgs {
  action: string;
  facing: string;
  index: number;
  frames: number;
  prompt: string;
  provider: string;
  model?: string;
  method?: string;
  size: number;
  /** Origin sprite bytes — seam for future method-conditioned img2img. */
  originData: Buffer;
}

export interface GeneratedFrame {
  data: Buffer;
  mediaType: string;
  provider: string;
  model?: string;
}

export type FrameGenerator = (args: FrameGeneratorArgs) => Promise<GeneratedFrame>;

export interface ExpandOptions {
  id: string;
  origin: string;
  game: string;
  actions: ExpandAction[];
  directions: string[];
  provider: string;
  model?: string;
  method?: string;
  fps: number;
  size: number;
  /** Target grid height for each graded frame (pixelize). */
  height: number;
  anchor: Anchor;
  scale: number;
  outputRoot: string;
  manifestPath?: string;
  usageLogPath?: string | null;
  licenseTerms?: string;
  licenseUrl?: string;
  padding?: number;
  /** Skip disk writes + manifest registration; synthesize + pack in memory only. */
  dryRun?: boolean;
  /** Injectable clock so license/generatedAt are deterministic in tests. */
  now?: () => Date;
  /** Injectable frame synthesizer (defaults to the provider abstraction). */
  generate?: FrameGenerator;
  log?: (chunk: string) => void;
}

export interface ExpandResult {
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

/** Parse `idle,run:6,attack` into actions with optional per-action frame counts. */
export function parseActions(raw: string | undefined, defaultFrames: number): ExpandAction[] {
  const seen = new Set<string>();
  const actions: ExpandAction[] = [];
  for (const part of (raw || "idle").split(",")) {
    const [nameRaw, framesRaw] = part.split(":");
    const name = (nameRaw ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const parsed = framesRaw === undefined ? NaN : parseInt(framesRaw, 10);
    const frames = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultFrames;
    actions.push({ name, frames });
  }
  return actions.length ? actions : [{ name: "idle", frames: defaultFrames }];
}

/** Resolve a direction-count flag to its ordered facing names. */
export function resolveDirections(dirs: number): string[] {
  const facings = DIRECTIONS[dirs];
  if (!facings) {
    throw new Error(`unsupported --dirs ${dirs}; expected one of ${Object.keys(DIRECTIONS).join(", ")}`);
  }
  return facings;
}

export function clipLoops(action: string): boolean {
  return !ONE_SHOT_ACTIONS.has(action);
}

/** Stable, unique frame id for an (action, facing, index) cell. */
export function frameId(action: string, facing: string, index: number): string {
  return `${action}__${facing}__${index}`;
}

/**
 * Grade one raw frame onto the DOOM grid. The flood-fill cutout in `pixelize`
 * erases a flat/low-luma frame (e.g. the mock provider's solid fill) entirely;
 * detect that (a throw, or an all-transparent result) and fall back to a plain
 * nearest-neighbour resize so every cell still yields a packable sprite.
 */
export async function gradeFrame(raw: Buffer, height: number): Promise<Buffer> {
  try {
    const graded = await pixelize(raw, { height });
    const stats = await sharp(graded).stats();
    const alpha = stats.channels[3];
    if (!alpha || alpha.max > 0) return graded;
  } catch {
    // pixelize's trim() throws on an all-transparent cutout — fall through.
  }
  return sharp(raw)
    .ensureAlpha()
    .resize({ height, kernel: sharp.kernel.nearest, fit: "inside", withoutEnlargement: false })
    .webp({ lossless: true })
    .toBuffer();
}

const defaultFrameGenerator: FrameGenerator = async ({ prompt, provider, model, size }) => {
  const asset = await generateAsset("sprite", prompt, {
    provider,
    model,
    size: `${size}x${size}`,
    log: () => {},
  });
  return { data: asset.data, mediaType: asset.mediaType, provider: asset.provider, model: asset.model };
};

function summaryPrompt(opts: ExpandOptions): string {
  const actions = opts.actions.map((a) => `${a.name}(${a.frames})`).join(", ");
  return `expand ${opts.id}: actions ${actions}; ${opts.directions.length} dir(s) ${opts.directions.join("/")}; from ${opts.origin}${opts.method ? `; method ${opts.method}` : ""}`;
}

function framePrompt(opts: ExpandOptions, action: string, facing: string, index: number, total: number): string {
  return `${action} animation, facing ${facing}, frame ${index + 1} of ${total}, derived from origin sprite; ${opts.game} game art style`;
}

/** Expand one origin sprite into a directional `sprite-anim` set. */
export async function expandSprite(opts: ExpandOptions): Promise<ExpandResult> {
  const log = opts.log ?? (() => {});
  const generate = opts.generate ?? defaultFrameGenerator;
  const padding = opts.padding ?? 2;

  if (!existsSync(opts.origin)) throw new Error(`origin sprite not found: ${opts.origin}`);
  const originData = await readFile(opts.origin);
  // Validate the origin is a real image before we synthesize anything off it.
  const originMeta = await sharp(originData).metadata();
  if (!originMeta.width || !originMeta.height) throw new Error(`origin is not a readable image: ${opts.origin}`);

  const relPath = `sprites/${opts.id}.anim0.webp`;
  const animRelPath = `sprites/${opts.id}.anim.json`;
  const previewRelPath = `previews/${opts.id}-anim.html`;
  const manifestPath = opts.manifestPath ?? join(opts.outputRoot, "assets.json");

  let usedProvider = opts.provider;
  let usedModel = opts.model;
  let outputPath: string | undefined;

  return withUsageAccounting<ExpandResult>(
    {
      usageLogPath: opts.usageLogPath,
      log,
      logStyle: "stream",
      event: () => ({
        command: "expand",
        provider: usedProvider,
        kind: "sprite-anim",
        game: opts.game,
        id: opts.id,
        model: usedModel,
        size: opts.size,
        outputPath,
        prompt: summaryPrompt(opts),
      }),
    },
    async () => {
      // 1. synthesize every (action × facing × frame) cell, then grade it.
      const frameInputs: { id: string; data: Buffer }[] = [];
      let providerSeen = false;
      for (const action of opts.actions) {
        for (const facing of opts.directions) {
          for (let i = 0; i < action.frames; i++) {
            const prompt = framePrompt(opts, action.name, facing, i, action.frames);
            const generated = await generate({
              action: action.name,
              facing,
              index: i,
              frames: action.frames,
              prompt,
              provider: opts.provider,
              model: opts.model,
              method: opts.method,
              size: opts.size,
              originData,
            });
            if (!providerSeen) {
              usedProvider = generated.provider;
              usedModel = generated.model;
              providerSeen = true;
            }
            const graded = await gradeFrame(generated.data, opts.height);
            frameInputs.push({ id: frameId(action.name, facing, i), data: graded });
          }
        }
      }
      log(`[expand] synthesized ${frameInputs.length} frame(s) via ${usedProvider}\n`);

      // 2. pack the graded frames into edge-extruded atlas page(s).
      const packed = await packFrameBuffers(frameInputs, { padding });
      const pages: AtlasPage[] = packed.pageDims.map((d, i) => ({
        image: `${opts.id}.anim${i}.webp`,
        width: d.width,
        height: d.height,
      }));

      // 3. build the frame map (clip → facing → ordered frame rects).
      const rectById = new Map(packed.frames.map((f) => [f.id, f]));
      // Clamp fps the same way the sibling sprite path does (sprites.ts) so a
      // 0/NaN fps cannot poison every frame's duration into JSON null.
      const fps = Math.max(1, Math.floor(opts.fps || 8));
      const duration = Math.max(1, Math.round(1000 / fps));
      const clips: Record<string, AnimClip> = {};
      for (const action of opts.actions) {
        const directions: Record<string, AnimFrame[]> = {};
        for (const facing of opts.directions) {
          directions[facing] = Array.from({ length: action.frames }, (_unused, i) => {
            const rect = rectById.get(frameId(action.name, facing, i))!;
            return { page: rect.page, x: rect.x, y: rect.y, w: rect.w, h: rect.h, duration };
          });
        }
        clips[action.name] = { loop: clipLoops(action.name), frames: action.frames, directions };
      }

      const stamp = opts.now?.() ?? new Date();
      const sheet: SpriteAnimSheet = {
        version: SPRITE_ANIM_VERSION,
        id: opts.id,
        game: opts.game,
        origin: opts.origin,
        ...(opts.method ? { method: opts.method } : {}),
        provider: usedProvider,
        ...(usedModel ? { model: usedModel } : {}),
        fps,
        padding: packed.padding,
        anchor: opts.anchor,
        scale: opts.scale,
        directions: opts.directions,
        pages,
        clips,
        frameCount: packed.frames.length,
      };

      const frameSize: [number, number] = [
        Math.max(...packed.frames.map((f) => f.w)),
        Math.max(...packed.frames.map((f) => f.h)),
      ];
      const license: AssetLicenseRecord = {
        ...licenseForGeneration({ provider: usedProvider, model: usedModel, kind: "sprite-anim", date: stamp }),
        type: "ai-generated",
        terms: opts.licenseTerms || "review required before shipping",
        ...(opts.licenseUrl ? { url: opts.licenseUrl } : {}),
        generatedAt: stamp.toISOString(),
      };
      const entry: AssetEntry = {
        id: opts.id,
        kind: "sprite-anim",
        game: opts.game,
        path: relPath,
        prompt: summaryPrompt(opts),
        provider: usedProvider,
        ...(usedModel ? { model: usedModel } : {}),
        // Max extent across all atlas pages so the field is never understated
        // when frames overflow to a second page; per-page geometry is in sheet.pages.
        dimensions: [Math.max(...pages.map((p) => p.width)), Math.max(...pages.map((p) => p.height))],
        frameSize,
        frames: packed.frames.length,
        fps,
        anchor: opts.anchor,
        scale: opts.scale,
        views: opts.directions,
        clips: opts.actions.map((a) => a.name),
        animation: animRelPath,
        origin: opts.origin,
        preview: previewRelPath,
        license,
      };

      if (opts.dryRun) {
        log(`[expand] dry-run: ${pages.length} page(s), ${packed.frames.length} frame(s); skipping writes\n`);
        return { id: opts.id, written: false, relPath, manifestPath, animRelPath, previewRelPath, pages, frameCount: packed.frames.length, entry, sheet };
      }

      // 4. write page images, the frame map, a preview, and register the entry.
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
      // Preview sits in previews/; page images live in sprites/ alongside the anim map.
      await writeFile(previewPath, animPreviewHtml({ id: opts.id, game: opts.game, sheet, sheetDirHref: "../sprites" }), "utf8");
      log(`[preview] ${previewPath}\n`);

      await register(manifestPath, entry);
      log(`[manifest] ${manifestPath} updated\n`);

      return { id: opts.id, written: true, outputPath, relPath, manifestPath, animPath, animRelPath, previewRelPath, pages, frameCount: packed.frames.length, entry, sheet };
    },
  );
}

export function animPreviewHtml(opts: { id: string; game: string; sheet: SpriteAnimSheet; sheetDirHref: string }): string {
  const rows = Object.entries(opts.sheet.clips)
    .map(
      ([name, clip]) =>
        `<tr><td>${escapeHtml(name)}</td><td>${clip.loop ? "loop" : "once"}</td><td>${clip.frames}</td><td>${Object.keys(clip.directions).join(", ")}</td></tr>`,
    )
    .join("\n");
  // One <img> per atlas page so multi-page sheets are fully previewed, not just page 0.
  const imgs = opts.sheet.pages
    .map(
      (page, i) =>
        `<img src="${escapeHtml(`${opts.sheetDirHref}/${page.image}`)}" alt="${escapeHtml(opts.id)} atlas page ${i}">`,
    )
    .join("\n  ");
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.id)} animation preview</title>
<style>
  :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; background: #0a0a0a; color: #e9e3d6; }
  body { margin: 0; min-height: 100vh; display: grid; gap: 1.5rem; place-content: center; padding: 2rem; }
  h1 { font-size: 1.1rem; color: #ff6a00; margin: 0; }
  img { image-rendering: pixelated; image-rendering: crisp-edges; max-width: 90vw; border: 1px solid #34343c; background: linear-gradient(45deg, #161214 25%, transparent 25%) 0 0 / 16px 16px; }
  table { border-collapse: collapse; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
  th, td { border: 1px solid #34343c; padding: 4px 10px; text-align: left; }
  th { color: #ff6a00; }
  .meta { color: #9b958a; font: 12px ui-monospace, Menlo, monospace; }
</style>
<main>
  <h1>${escapeHtml(opts.game)} · ${escapeHtml(opts.id)}</h1>
  <p class="meta">${opts.sheet.frameCount} frames · ${opts.sheet.fps} fps · ${opts.sheet.directions.join(", ")} · ${opts.sheet.pages.length} page(s)</p>
  ${imgs}
  <table>
    <tr><th>clip</th><th>play</th><th>frames</th><th>facings</th></tr>
    ${rows}
  </table>
</main>
</html>
`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
