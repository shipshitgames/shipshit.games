// Pure preview-loader config for the Studio 3D pane, kept free of three.js and
// DOM imports so the decoder wiring can be unit-tested under bun test. The
// optimize pipeline (packages/assetgen/src/model3d.ts) always Draco-compresses
// geometry and can KTX2/WebP textures, so the previewer wires BOTH a DRACOLoader
// and a KTX2Loader; three's GLTFLoader only invokes each one when the GLB
// actually declares the matching extension (KHR_draco_mesh_compression /
// KHR_texture_basisu), so wiring both is always safe.

export const MODEL_MEDIA_TYPE = "model/gltf-binary";

export interface DecoderPaths {
  /** Directory URL passed to DRACOLoader.setDecoderPath — must end in a slash. */
  draco: string;
  /** Directory URL passed to KTX2Loader.setTranscoderPath — must end in a slash. */
  ktx2: string;
}

// Decoder assets are emitted next to the renderer bundle (see vite.config.ts's
// `bundleThreeDecoders` plugin), so a RELATIVE base resolves correctly under both
// the dev server (http://localhost) and the packaged file:// app loaded via
// `loadFile`. three's loaders join their decoder filenames onto this prefix
// verbatim, so the trailing slash is load-bearing.
export const DECODER_BASE = "./decoders/";

function withTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

/**
 * Resolve the DRACO decoder + KTX2 (basis) transcoder directories from a base
 * URL. `base` is normalized so callers may pass it with or without a trailing
 * slash; the returned paths always carry one (three's loaders require it).
 */
export function decoderPaths(base: string = DECODER_BASE): DecoderPaths {
  const root = withTrailingSlash(base);
  return { draco: `${root}draco/`, ktx2: `${root}basis/` };
}

/** Whether a studio:generate result is a GLB the 3D previewer can render. */
export function isModelResult(mediaType: string | null | undefined): boolean {
  return mediaType === MODEL_MEDIA_TYPE;
}
