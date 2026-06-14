// Pure parsing of the assetgen CLI output for studio:generate, kept free of
// electron imports so the result contract can be unit-tested under bun test.
// The pipeline logs `[wrote] <abs path> (<size> kb, <media type>)`; audio kinds
// (music via suno → .webm/.ogg) made the old hardcoded `.webp` match miss them.

export interface GenerateResult {
  path: string;
  mediaType: string;
}

// Extension → media type fallback for wrote-lines without the parenthesized
// suffix. Mirrors packages/assetgen/src/media.ts (kept local: its URL-keyed
// map lacks png, and a copy keeps the main bundle decoupled from assetgen).
const MEDIA_TYPE_BY_EXTENSION: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webm: "audio/webm",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  glb: "model/gltf-binary",
};

// `[wrote] <path>` with an optional ` (<NN.N> kb, <media type>)` suffix; the
// path is matched lazily so the suffix is preferred whenever it is present.
const WROTE_LINE = /\[wrote\] (.+?)(?: \([\d.]+ kb, ([a-z]+\/[\w.+-]+)\))?$/gm;

function mediaTypeForPath(path: string): string {
  const extension = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
  return MEDIA_TYPE_BY_EXTENSION[extension] || "application/octet-stream";
}

function parseGenerateResult(buf: string): GenerateResult | null {
  let last: RegExpMatchArray | null = null;
  for (const match of buf.matchAll(WROTE_LINE)) last = match;
  if (!last) return null;
  const path = last[1].trim();
  return { path, mediaType: last[2] || mediaTypeForPath(path) };
}

// Media types the renderer can preview inline: images in an <img>, audio in an
// <audio>, and GLB models in the three.js viewer (decoded from the data URL).
// Anything else (e.g. html billboards) has no inline preview.
const PREVIEWABLE_PREFIXES = ["image/", "audio/"];
const PREVIEWABLE_EXACT = new Set(["model/gltf-binary"]);

function isPreviewable(mediaType: string): boolean {
  return PREVIEWABLE_PREFIXES.some((prefix) => mediaType.startsWith(prefix)) || PREVIEWABLE_EXACT.has(mediaType);
}

// Data URL for the renderer preview. GLB bytes ride the same base64 data URL so
// the three.js GLTFLoader can fetch them without a file:// round-trip.
function dataUrlFor(result: GenerateResult, bytes: Buffer): string | null {
  if (!isPreviewable(result.mediaType)) return null;
  return `data:${result.mediaType};base64,${bytes.toString("base64")}`;
}

export { parseGenerateResult, dataUrlFor };
