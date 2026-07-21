import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";
import { softGradeRgba, type ColorGamutReport } from "./soft-grade";

// Moved to sprite-prompt.ts (pure, no sharp) so API bundles can import it
// without native deps; re-exported here so existing imports keep working.
export { spritePromptDirective } from "./sprite-prompt";

export type Anchor = [number, number];

export interface SpriteSheetOptions {
  id: string;
  game: string;
  prompt: string;
  provider: string;
  model?: string;
  views?: string[];
  frameCount?: number;
  fps?: number;
  anchor?: Anchor;
  scale?: number;
  size?: number;
  licenseTerms?: string;
  licenseUrl?: string;
  generatedAt?: string;
  /** Apply the canonical soft grade before the final sheet encode. */
  softGrade?: boolean;
}

export interface SpriteSheetMetadata {
  dimensions: [number, number];
  frameSize: [number, number];
  frames: number;
  fps?: number;
  anchor: Anchor;
  scale: number;
  views: string[];
  sheet: {
    columns: number;
    rows: number;
    usedColumns: number;
    usedRows: number;
  };
  license: {
    type: string;
    provider: string;
    model?: string;
    generatedAt: string;
    terms: string;
    url?: string;
  };
}

export interface SpriteSheetResult {
  data: Buffer;
  metadata: SpriteSheetMetadata;
  frames: SpriteSheetFrame[];
  colorGamutReport?: ColorGamutReport;
}

export interface SpriteSheetFrame {
  data: Buffer;
  frame: number;
  view: string;
  column: number;
  row: number;
  dimensions: [number, number];
}

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Max luma (0-255) treated as keyable near-black background in the edge flood-fill. */
const EDGE_BG_LUMA = 16;

export function parseViews(raw?: string): string[] {
  const views = (raw || "front")
    .split(",")
    .map((view) => view.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-"))
    .filter(Boolean);
  return views.length ? [...new Set(views)] : ["front"];
}

export function parseAnchor(raw?: string): Anchor {
  if (!raw) return [0.5, 1];
  const [xRaw, yRaw] = raw.split(",");
  const x = Number(xRaw);
  const y = Number(yRaw);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [0.5, 1];
  return [clamp(x, 0, 1), clamp(y, 0, 1)];
}

export function manifestKindForSprite(kind: string, frameCount: number): string {
  if (kind === "sprite" && frameCount > 1) return "sprite-anim";
  return kind;
}

export async function toSpriteSheetWebp(input: Buffer, opts: SpriteSheetOptions): Promise<SpriteSheetResult> {
  const views = opts.views?.length ? opts.views : ["front"];
  const frameCount = Math.max(1, Math.floor(opts.frameCount ?? 1));
  const layout = spriteLayout(views.length, frameCount);
  const size = nextPowerOfTwo(Math.max(16, Math.floor(opts.size ?? 1024)));
  const frameWidth = Math.max(1, Math.floor(size / layout.columns));
  const frameHeight = Math.max(1, Math.floor(size / layout.rows));
  const sheetWidth = frameWidth * layout.columns;
  const sheetHeight = frameHeight * layout.rows;

  // Treat the provider image as a usedColumns x usedRows grid (the layout the
  // prompt directive asked for) and slice each source cell into its own sheet
  // cell, so frames/views are real subimages, not one stretched picture.
  const cutout = await transparentizeEdgeBackground(input);
  const trimmed = await sharp(cutout).ensureAlpha().trim().png().toBuffer();
  const trimmedMeta = await sharp(trimmed).metadata();
  const sourceWidth = Math.max(1, trimmedMeta.width ?? frameWidth);
  const sourceHeight = Math.max(1, trimmedMeta.height ?? frameHeight);
  const srcCellWidth = Math.max(1, Math.floor(sourceWidth / layout.usedColumns));
  const srcCellHeight = Math.max(1, Math.floor(sourceHeight / layout.usedRows));

  const cells: sharp.OverlayOptions[] = [];
  const frameSlots: Array<Omit<SpriteSheetFrame, "data">> = [];
  for (let row = 0; row < layout.usedRows; row++) {
    for (let col = 0; col < layout.usedColumns; col++) {
      const left = Math.min(col * srcCellWidth, sourceWidth - srcCellWidth);
      const top = Math.min(row * srcCellHeight, sourceHeight - srcCellHeight);
      const cell = await sharp(trimmed)
        .extract({ left, top, width: srcCellWidth, height: srcCellHeight })
        .resize(frameWidth, frameHeight, { fit: "contain", background: TRANSPARENT })
        .png()
        .toBuffer();
      cells.push({ input: cell, left: col * frameWidth, top: row * frameHeight });
      frameSlots.push({
        frame: frameCount > 1 ? col : 0,
        view: frameCount > 1 ? views[row] ?? views[0] ?? "front" : views[col] ?? views[0] ?? "front",
        column: col,
        row,
        dimensions: [frameWidth, frameHeight],
      });
    }
  }

  const composed = await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite(cells)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sheetData = Buffer.from(composed.data);
  const colorGamutReport = opts.softGrade
    ? softGradeRgba(sheetData, composed.info.width, composed.info.height).report
    : undefined;
  const frames: SpriteSheetFrame[] = [];
  for (const slot of frameSlots) {
    const frameData = await sharp(sheetData, {
      raw: { width: composed.info.width, height: composed.info.height, channels: 4 },
    })
      .extract({
        left: slot.column * frameWidth,
        top: slot.row * frameHeight,
        width: frameWidth,
        height: frameHeight,
      })
      .webp({ lossless: true, effort: 5 })
      .toBuffer();
    frames.push({ ...slot, data: frameData });
  }
  const data = await sharp(sheetData, {
    raw: { width: composed.info.width, height: composed.info.height, channels: 4 },
  })
    .webp({ lossless: true, effort: 5 })
    .toBuffer();

  return {
    data,
    frames,
    ...(colorGamutReport ? { colorGamutReport } : {}),
    metadata: {
      dimensions: [sheetWidth, sheetHeight],
      frameSize: [frameWidth, frameHeight],
      frames: frameCount,
      fps: frameCount > 1 ? Math.max(1, Math.floor(opts.fps ?? 8)) : undefined,
      anchor: opts.anchor ?? [0.5, 1],
      scale: opts.scale ?? 1,
      views,
      sheet: layout,
      license: {
        type: "ai-generated",
        provider: opts.provider,
        model: opts.model,
        generatedAt: opts.generatedAt ?? new Date().toISOString(),
        terms: opts.licenseTerms || "review required before shipping",
        url: opts.licenseUrl,
      },
    },
  };
}

export async function writeBillboardPreview(opts: {
  outPath: string;
  assetHref: string;
  id: string;
  game: string;
  metadata: SpriteSheetMetadata;
}): Promise<void> {
  await mkdir(dirname(opts.outPath), { recursive: true });
  await writeFile(opts.outPath, billboardPreviewHtml(opts), "utf8");
}

function billboardPreviewHtml(opts: {
  assetHref: string;
  id: string;
  game: string;
  metadata: SpriteSheetMetadata;
}): string {
  const meta = opts.metadata;
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.id)} billboard preview</title>
<style>
  :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; background: #0a0a0a; color: #e9e3d6; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at 50% 18%, #241a1a 0, #0a0a0a 45rem); }
  .stage { width: min(900px, 96vw); aspect-ratio: 16 / 10; position: relative; overflow: hidden; border: 1px solid #34343c; background: linear-gradient(#101014 0 48%, #08080a 48%); }
  .floor { position: absolute; inset: 48% -12% -18%; transform: perspective(520px) rotateX(62deg); transform-origin: top; background-image: linear-gradient(#34343c 1px, transparent 1px), linear-gradient(90deg, #34343c 1px, transparent 1px); background-size: 48px 48px; opacity: .55; }
  .billboard { position: absolute; left: 50%; bottom: 15%; transform: translateX(-50%); width: min(38%, 320px); height: 58%; display: grid; place-items: end center; border-bottom: 2px solid #ff6a00; }
  img { max-width: 100%; max-height: 100%; object-fit: contain; image-rendering: pixelated; image-rendering: crisp-edges; filter: drop-shadow(0 0 20px rgba(193,18,31,.35)); }
  .hud { position: absolute; left: 18px; right: 18px; bottom: 16px; display: flex; justify-content: space-between; gap: 16px; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; color: #9b958a; }
  .hud b { color: #ff6a00; font-weight: 700; }
</style>
<main class="stage" aria-label="Sprite billboard preview">
  <div class="floor"></div>
  <div class="billboard"><img src="${escapeHtml(opts.assetHref)}" alt="${escapeHtml(opts.id)}"></div>
  <div class="hud">
    <span><b>${escapeHtml(opts.game)}</b> ${meta.dimensions[0]}x${meta.dimensions[1]} sheet</span>
    <span>${meta.views.join(", ")} · frame ${meta.frameSize[0]}x${meta.frameSize[1]} · ${meta.frames} frame(s)</span>
  </div>
</main>
</html>
`;
}

function spriteLayout(viewCount: number, frameCount: number): SpriteSheetMetadata["sheet"] {
  const usedColumns = frameCount > 1 ? frameCount : Math.max(1, viewCount);
  const usedRows = frameCount > 1 ? Math.max(1, viewCount) : 1;
  return {
    columns: nextPowerOfTwo(usedColumns),
    rows: nextPowerOfTwo(usedRows),
    usedColumns,
    usedRows,
  };
}

export async function transparentizeEdgeBackground(input: Buffer): Promise<Buffer> {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const data = Buffer.from(image.data);
  const width = image.info.width;
  const height = image.info.height;
  const channels = image.info.channels;
  const total = width * height;
  const visited = new Uint8Array(total);
  const stack: number[] = [];
  let removed = 0;

  const isBackground = (index: number): boolean => {
    const offset = index * channels;
    const alpha = data[offset + 3] ?? 255;
    if (alpha < 8) return true;
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Only key out true near-black (e.g. the DOOM #0a0a0a backdrop). A higher
    // threshold floods through dark subject pixels and erases the sprite.
    return luma <= EDGE_BG_LUMA;
  };

  const seed = (index: number) => {
    if (!visited[index] && isBackground(index)) {
      visited[index] = 1;
      stack.push(index);
    }
  };

  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }

  while (stack.length) {
    const index = stack.pop()!;
    const alphaOffset = index * channels + 3;
    if ((data[alphaOffset] ?? 0) !== 0) {
      data[alphaOffset] = 0;
      removed++;
    }
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) seed(index - 1);
    if (x < width - 1) seed(index + 1);
    if (y > 0) seed(index - width);
    if (y < height - 1) seed(index + width);
  }

  if (removed >= total) return sharp(input).ensureAlpha().png().toBuffer();
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

function nextPowerOfTwo(n: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(1, n)));
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
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
