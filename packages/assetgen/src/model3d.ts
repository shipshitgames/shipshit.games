/**
 * 3D-model optimize core (issue #20).
 *
 * A provider hands us a *raw* GLB (Meshy/Tripo text/image -> mesh). Before any
 * model entry is written, that GLB MUST pass through the mandatory
 * gltf-transform optimize:
 *
 *   weld -> dedup -> prune -> (texture compress) -> Draco geometry compress
 *
 * Draco geometry compression is always applied — it is the non-negotiable part
 * of the optimize and works fully offline. Textures are compressed to WebP via
 * the `sharp` encoder by default. KTX2/Basis supercompression is *encoder-gated*:
 * it needs a KTX-Software (`toktx`/Basis) encoder that gltf-transform does not
 * bundle and that is not present in CI, so when no such encoder is wired we fall
 * back to WebP (or leave textures untouched when the model has none). The
 * returned {@link ModelCompression} always records exactly what was applied, so
 * the manifest never overstates the optimization.
 */
import { NodeIO } from "@gltf-transform/core";
import type { Document, Transform } from "@gltf-transform/core";
import { EXTTextureWebP, KHRDracoMeshCompression, KHRTextureBasisu } from "@gltf-transform/extensions";
import { dedup, draco, prune, textureCompress, weld } from "@gltf-transform/functions";
import sharp from "sharp";
import { parseGltfJson, summarizeModel } from "./asset-index.ts";
import type { ModelSummary } from "./asset-index.ts";
import type { ModelCompression } from "./manifest.ts";

/** Asset kinds that resolve to the 3D-model pipeline. */
export const MODEL_KINDS = ["model", "3d"] as const;
/** On-disk extension for generated models (binary glTF). */
export const MODEL_EXTENSION = "glb";
/** Media type recorded for generated models. */
export const MODEL_MEDIA_TYPE = "model/gltf-binary";

/** True when `kind` should be routed through the 3D-model generator. */
export function isModelKind(kind: string): boolean {
  return (MODEL_KINDS as readonly string[]).includes(kind);
}

export interface OptimizeModelOptions {
  /** Apply Draco geometry compression. Default true; the optimize is meaningless without it. */
  draco?: boolean;
  /**
   * Attempt KTX2/Basis texture supercompression. Honoured only when a KTX2
   * encoder is available (see {@link ktx2EncoderAvailable}); otherwise textures
   * fall back to WebP and `compression.ktx2` stays false.
   */
  ktx2?: boolean;
  /** Compress embedded textures to WebP via sharp when KTX2 is unavailable. Default true. */
  webpTextures?: boolean;
}

export interface ModelOptimizeResult {
  /** The optimized GLB bytes, ready to write to disk. */
  data: Buffer;
  /** Exactly what the optimize applied (geometry + texture compression, byte sizes). */
  compression: ModelCompression;
  /** Mesh/material/texture/skin/animation tallies parsed back from the optimized GLB. */
  summary: ModelSummary;
  /** Animation clip names bundled in the model (convenience view of `summary.animations`). */
  animations: string[];
}

// draco3dgltf's wasm encoder/decoder are expensive to instantiate; build them
// once and reuse across every optimize in a process (e.g. a generate matrix).
let dracoDepsPromise: Promise<Record<string, unknown>> | null = null;
function dracoDependencies(): Promise<Record<string, unknown>> {
  if (!dracoDepsPromise) {
    dracoDepsPromise = (async () => {
      const draco3d = await import("draco3dgltf");
      const [encoder, decoder] = await Promise.all([
        draco3d.createEncoderModule(),
        draco3d.createDecoderModule(),
      ]);
      return { "draco3d.encoder": encoder, "draco3d.decoder": decoder };
    })();
  }
  return dracoDepsPromise;
}

/**
 * A NodeIO wired with the extensions the optimize touches:
 *  - KHR_draco_mesh_compression — read provider GLBs that may already be Draco
 *    compressed, and write Draco-compressed geometry.
 *  - EXT_texture_webp / KHR_texture_basisu — so when `textureCompress` re-encodes
 *    textures to WebP (or a future KTX2 encoder to Basis), the writer records the
 *    extension in `extensionsUsed`. Without this the GLB would reference
 *    image/webp from a core `textures[].source`, which is non-conformant glTF 2.0
 *    and fails to load textures in standard loaders.
 */
async function buildIo(): Promise<NodeIO> {
  const io = new NodeIO();
  io.registerExtensions([KHRDracoMeshCompression, EXTTextureWebP, KHRTextureBasisu]);
  io.registerDependencies(await dracoDependencies());
  return io;
}

/**
 * Read the embedded-texture container back from the *transformed* document, so
 * the recorded `textureFormat` reflects what the written GLB actually carries —
 * never what we intended. `prune` can drop the model's only texture, and a model
 * may arrive with none, so this must be derived post-transform.
 */
function finalTextureFormat(document: Document): ModelCompression["textureFormat"] {
  const mimeTypes = new Set(document.getRoot().listTextures().map((texture) => texture.getMimeType()));
  if (mimeTypes.has("image/ktx2")) return "ktx2";
  if (mimeTypes.has("image/webp")) return "webp";
  return "none";
}

/**
 * Whether a KTX2/Basis texture encoder is wired in this environment. gltf-transform
 * v4 has no built-in KTX2 encoder (it shells out to KTX-Software's `toktx`), which
 * is not a dependency here, so this is false unless a future build injects one.
 */
function ktx2EncoderAvailable(): boolean {
  return false;
}

/**
 * Run the mandatory gltf-transform optimize over a raw provider GLB and report
 * precisely what was applied. Pure with respect to the filesystem and network.
 */
export async function optimizeGlb(raw: Buffer, options: OptimizeModelOptions = {}): Promise<ModelOptimizeResult> {
  const useDraco = options.draco !== false;
  const io = await buildIo();
  const document = await io.readBinary(new Uint8Array(raw));

  const transforms: Transform[] = [weld(), dedup(), prune()];

  // Texture compression only matters when the model embeds textures. KTX2/Basis
  // is encoder-gated (`ktx2EncoderAvailable()` — there is no toktx in this
  // environment), so when KTX2 is requested but unavailable we fall back to WebP.
  // textureCompress only targets jpeg/png/webp/avif; a future KTX2 encoder would
  // add its own transform under the first branch.
  const textureCount = document.getRoot().listTextures().length;
  const ktx2Wanted = options.ktx2 === true && ktx2EncoderAvailable();
  if (textureCount > 0 && !ktx2Wanted && options.webpTextures !== false) {
    transforms.push(textureCompress({ encoder: sharp, targetFormat: "webp" }));
  }

  // Geometry compression runs last, after welding/pruning have settled the mesh.
  if (useDraco) transforms.push(draco());

  await document.transform(...transforms);
  const data = Buffer.from(await io.writeBinary(document));
  const summary = summarizeModel(parseGltfJson(data));

  // Truthfully record what survived the transform: prune may have folded away
  // the only texture, and KTX2 is encoder-gated, so read the format back from
  // the document rather than trusting the requested options.
  const textureFormat = finalTextureFormat(document);

  return {
    data,
    compression: {
      draco: useDraco,
      ktx2: textureFormat === "ktx2",
      textureFormat,
      rawBytes: raw.length,
      optimizedBytes: data.length,
    },
    summary,
    animations: summary.animations.map((animation) => animation.name),
  };
}
