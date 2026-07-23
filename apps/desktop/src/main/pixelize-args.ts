// Pure assembly of the assetgen CLI argv for studio:pixelize (#66), kept free of
// electron imports so the spawn contract can be unit-tested under bun test. The
// Sprites pane reaches assetgen's pixelize() through the SAME `pixelize` CLI verb
// the terminal uses — one impl, two surfaces — rather than importing pixelize()
// directly, which would pull `sharp` (a native addon) into the Electron bundle.
// Validation comes from assetgen's bundle-safe pixelize-opts (no sharp), so the
// renderer, CLI, and main process can never drift on the accepted values.
import {
  clampBgThreshold,
  clampHeight,
  normalizeCutoutMode,
  normalizePaletteName,
} from "../../../../packages/assetgen/src/pixelize-opts.ts";

interface BuildPixelizeArgsInput {
  assetgenPath?: string;
  assetgenArgs?: string[];
  inPath: string;
  outPath: string;
  opts?: {
    height?: unknown;
    bgThreshold?: unknown;
    cutout?: unknown;
    palette?: unknown;
    trim?: unknown;
    preserveSize?: unknown;
  };
}

export function buildPixelizeArgs({ assetgenPath, assetgenArgs, inPath, outPath, opts = {} }: BuildPixelizeArgsInput) {
  const height = clampHeight(opts?.height);
  const bg = clampBgThreshold(opts?.bgThreshold);
  const cutout = normalizeCutoutMode(opts?.cutout);
  const palette = normalizePaletteName(opts?.palette);
  const prefix = Array.isArray(assetgenArgs)
    ? assetgenArgs.map(String)
    : assetgenPath
      ? [assetgenPath]
      : [];
  const args = [
    ...prefix,
    "pixelize",
    "--in", inPath,
    "--out", outPath,
    "--height", String(height),
    "--bg", String(bg),
    "--cutout", cutout,
    "--palette", palette,
  ];
  if (opts.trim === false) args.push("--no-trim");
  if (opts.preserveSize === true) args.push("--preserve-size");
  return { args, height, bg, cutout, palette };
}

/** Decode a `data:<mime>;base64,<payload>` URL (the renderer's inline preview) to bytes. */
export function decodePixelizeDataUrl(dataUrl: unknown): { mime: string; buffer: Buffer } | null {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(String(dataUrl || ""));
  if (!match) return null;
  return { mime: match[1]!, buffer: Buffer.from(match[2]!, "base64") };
}

/** Parse the CLI's `[pixelize] cutout: <tool> (<reason>)` line back into structured info. */
export function parsePixelizeCutout(log: unknown): { tool: string; reason?: string } | null {
  const match = /\[pixelize\] cutout: (\S+)(?: \((.+?)\))?/.exec(String(log || ""));
  if (!match) return null;
  return match[2] ? { tool: match[1]!, reason: match[2] } : { tool: match[1]! };
}
