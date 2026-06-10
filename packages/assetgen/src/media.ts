/**
 * Shared download + media-type helpers for HTTP-based asset providers.
 * Kept free of heavy deps (sharp, node-pty) so the desktop main process can
 * import provider catalogs without dragging native modules into its bundle.
 */

export interface GeneratedAsset {
  data: Buffer;
  mediaType: string;
  extension: string;
  model?: string;
}

export async function downloadGeneratedAsset(
  url: string,
  model?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeneratedAsset> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`download ${res.status}: ${await res.text()}`);
  const mediaType = res.headers.get("content-type")?.split(";")[0]?.trim() || mediaTypeFromUrl(url);
  return {
    data: Buffer.from(await res.arrayBuffer()),
    mediaType,
    extension: extensionForMediaType(mediaType, url),
    model,
  };
}

export function outputUrl(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.find((item): item is string => typeof item === "string");
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    const direct = obj.audio_url ?? obj.audioUrl ?? obj.image_url ?? obj.imageUrl ?? obj.url;
    if (typeof direct === "string") return direct;
    if (Array.isArray(obj.data)) return outputUrl(obj.data);
    if (obj.output) return outputUrl(obj.output);
  }
  return undefined;
}

export function mediaTypeFromUrl(url: string): string {
  if (url.endsWith(".webp")) return "image/webp";
  if (url.endsWith(".jpg") || url.endsWith(".jpeg")) return "image/jpeg";
  if (url.endsWith(".mp3")) return "audio/mpeg";
  if (url.endsWith(".ogg")) return "audio/ogg";
  if (url.endsWith(".webm")) return "audio/webm";
  if (url.endsWith(".wav")) return "audio/wav";
  if (url.endsWith(".glb")) return "model/gltf-binary";
  return "application/octet-stream";
}

export function extensionForMediaType(mediaType: string, url = ""): string {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/webp") return "webp";
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "audio/mpeg") return "mp3";
  if (mediaType === "audio/ogg") return "ogg";
  if (mediaType === "audio/webm") return "webm";
  if (mediaType === "audio/wav") return "wav";
  if (mediaType === "model/gltf-binary") return "glb";
  const match = url.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i);
  return match?.[1]?.toLowerCase() ?? "bin";
}
