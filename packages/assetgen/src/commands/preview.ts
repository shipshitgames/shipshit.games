import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

import { flag, has } from "./args.ts";

const MODEL_VIEWER_URL = "https://unpkg.com/@google/model-viewer@4.3.1/dist/model-viewer.min.js";
const MODEL_VIEWER_INTEGRITY =
  "sha384-cprcVQt7wbUl0xngF3PGP6yBB7n4/t+4AoAMG9biiMCGFiWOdzUH10Ie2COTqFNW";

export type PreviewKind = "image" | "audio" | "model" | "export-pack" | "file";

export interface PreviewTarget {
  kind: PreviewKind;
  source: string;
  target: string;
  mediaType?: string;
}

/** Emit a review target for generated media; GLBs get a small browser viewer, other files open directly. */
export async function runPreviewCommand(argv: string[]): Promise<void> {
  try {
    const positional = previewInput(argv);
    const inputPath = flag(argv, "in") ?? positional;
    if (!inputPath) throw new Error("--in <asset> is required");
    const target = await buildPreviewTarget(inputPath, { outPath: flag(argv, "out") });
    if (has(argv, "json")) console.log(JSON.stringify(target, null, 2));
    else console.log(`[preview] ${target.kind}: ${target.target}`);
    if (has(argv, "open")) openPreviewTarget(target.target);
  } catch (error) {
    console.error(`[preview] ${String((error as Error)?.message ?? error)}`);
    process.exit(1);
  }
}

export async function buildPreviewTarget(
  input: string,
  options: { outPath?: string } = {},
): Promise<PreviewTarget> {
  const source = resolve(input);
  if (!existsSync(source)) throw new Error(`asset not found: ${source}`);
  const extension = extname(source).toLowerCase();
  const media = mediaForExtension(extension);

  if (media.kind !== "model") {
    return {
      kind: media.kind,
      source,
      target: source,
      ...(media.mediaType ? { mediaType: media.mediaType } : {}),
    };
  }

  const target = resolve(options.outPath ?? `${source}.preview.html`);
  const previewData =
    extension === ".gltf"
      ? await bundleGltfForPreview(source)
      : { data: await readFile(source), mediaType: media.mediaType };
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, modelPreviewHtml(source, previewData.data, previewData.mediaType));
  return { kind: "model", source, target, mediaType: previewData.mediaType };
}

export function modelPreviewHtml(source: string, data: Buffer, mediaType = "model/gltf-binary"): string {
  const sourceUrl = `data:${mediaType};base64,${data.toString("base64")}`;
  const title = escapeHtml(basename(source));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} preview</title>
  <script type="module" src="${MODEL_VIEWER_URL}" integrity="${MODEL_VIEWER_INTEGRITY}" crossorigin="anonymous"></script>
  <style>
    html,body { margin:0; width:100%; height:100%; background:#0a0a0a; color:#e9e3d6; font:14px system-ui,sans-serif; }
    model-viewer { width:100%; height:100%; background:radial-gradient(circle,#34343c 0,#121214 55%,#0a0a0a 100%); }
    .label { position:fixed; left:12px; bottom:10px; padding:6px 8px; background:#121214cc; border-radius:6px; }
  </style>
</head>
<body>
  <model-viewer src="${escapeHtml(sourceUrl)}" camera-controls auto-rotate shadow-intensity="1"></model-viewer>
  <div class="label">${title}</div>
</body>
</html>
`;
}

/**
 * Resolve a JSON glTF's local sidecars and emit one binary glTF for the data URL
 * viewer. Network resources and paths outside the model directory are rejected:
 * previewing a downloaded model must not become an arbitrary file/network read.
 */
export async function bundleGltfForPreview(
  source: string,
): Promise<{ data: Buffer; mediaType: "model/gltf-binary" }> {
  const sourcePath = await realpath(resolve(source));
  const sourceDir = dirname(sourcePath);
  const document: unknown = JSON.parse(await readFile(sourcePath, "utf8"));
  const resourceUris = gltfResourceUris(document).filter((uri) => !/^data:/i.test(uri));

  for (const uri of resourceUris) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(uri) || uri.startsWith("//") || uri.includes("?") || uri.includes("#")) {
      throw new Error(`GLTF preview only accepts local relative resources: ${uri}`);
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(uri);
    } catch {
      throw new Error(`GLTF preview resource has invalid URI encoding: ${uri}`);
    }
    if (isAbsolute(decoded)) {
      throw new Error(`GLTF preview only accepts local relative resources: ${uri}`);
    }
    const resourcePath = await realpath(resolve(sourceDir, decoded));
    if (!isPathInside(sourceDir, resourcePath)) {
      throw new Error(`GLTF preview resource escapes the model directory: ${uri}`);
    }
  }

  const draco3d = await import("draco3dgltf");
  const [dracoEncoder, dracoDecoder] = await Promise.all([
    draco3d.createEncoderModule(),
    draco3d.createDecoderModule(),
    MeshoptEncoder.ready,
    MeshoptDecoder.ready,
  ]);
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.encoder": dracoEncoder,
      "draco3d.decoder": dracoDecoder,
      "meshopt.encoder": MeshoptEncoder,
      "meshopt.decoder": MeshoptDecoder,
    });
  const gltf = await io.read(sourcePath);
  return { data: Buffer.from(await io.writeBinary(gltf)), mediaType: "model/gltf-binary" };
}

export function openPreviewTarget(target: string): void {
  const command =
    process.platform === "darwin"
      ? ["open", target]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", target]
        : ["xdg-open", target];
  const child = spawn(command[0]!, command.slice(1), { detached: true, stdio: "ignore" });
  child.unref();
}

export function previewInput(argv: string[]): string | undefined {
  const valueFlags = new Set(["--in", "--out"]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (valueFlags.has(arg)) {
      index += 1;
      continue;
    }
    if (!arg.startsWith("-")) return arg;
  }
  return undefined;
}

function mediaForExtension(extension: string): { kind: PreviewKind; mediaType?: string } {
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(extension)) {
    const mediaType =
      extension === ".svg"
        ? "image/svg+xml"
        : [".jpg", ".jpeg"].includes(extension)
          ? "image/jpeg"
          : `image/${extension.slice(1)}`;
    return { kind: "image", mediaType };
  }
  if ([".wav", ".mp3", ".ogg", ".webm", ".m4a", ".flac"].includes(extension)) {
    return { kind: "audio", mediaType: `audio/${extension.slice(1)}` };
  }
  if (extension === ".glb" || extension === ".gltf") {
    return {
      kind: "model",
      mediaType: extension === ".glb" ? "model/gltf-binary" : "model/gltf+json",
    };
  }
  if ([".zip", ".tar", ".tgz", ".gz"].includes(extension)) return { kind: "export-pack" };
  return { kind: "file" };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function isPathInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function gltfResourceUris(document: unknown): string[] {
  if (!isRecord(document)) throw new Error("GLTF preview source must contain a JSON object");
  const resources = [document.buffers, document.images].flatMap((collection) =>
    Array.isArray(collection) ? collection : [],
  );
  return resources.flatMap((resource) =>
    isRecord(resource) && typeof resource.uri === "string" ? [resource.uri] : [],
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
