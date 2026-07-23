import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
// Type-only: keeps node:crypto out of the desktop main bundle that imports register().
import type { AssetProvenance, AssetHumanAuthorship } from "./provenance.ts";

export interface AssetEntry {
  id: string;
  kind: string;
  game: string;
  path: string; // relative to the assets root
  prompt?: string;
  /** Local source/reference images used for style, silhouette, palette, or edit guidance. */
  referenceImages?: string[];
  provider?: string;
  /** Provider model/plan used, surfaced for sprite + image assets. */
  model?: string;
  /** Sprite-sheet geometry (issue #19); present for sprite/sprite-anim assets. */
  dimensions?: [number, number];
  frameSize?: [number, number];
  frames?: number;
  fps?: number;
  anchor?: [number, number];
  scale?: number;
  views?: string[];
  sheet?: {
    columns: number;
    rows: number;
    usedColumns: number;
    usedRows: number;
  };
  /** Animation clip names for sprite-anim assets (issue #71); e.g. ["idle","run","attack"]. */
  clips?: string[];
  /** Relative path to the animation frame map (`<id>.anim.json`) for sprite-anim assets. */
  animation?: string;
  /** Origin sprite this animation was expanded from (issue #71 provenance). */
  origin?: string;
  /** Audio playback metadata (issue #21); present for music/sfx/voice assets. */
  category?: string;
  volume?: number;
  loop?: boolean;
  duration?: number;
  /** Relative path to a generated billboard preview, if any. */
  preview?: string;
  /** Reproducibility provenance (issue #55): provider/model/seed + prompt & style hashes. */
  provenance?: AssetProvenance;
  /** Human-authorship disclosure (issue #55), present when a person authored/edited the asset. */
  human?: AssetHumanAuthorship;
  /** 3D-model post-optimize flag (issue #20): true once the mandatory gltf-transform optimize has run. */
  optimized?: boolean;
  /** 3D-model compression provenance (issue #20): records exactly what optimize applied. */
  compression?: ModelCompression;
  /** Animation clip names bundled in a 3D model (issue #20); e.g. ["idle"]. */
  animations?: string[];
  /** glTF tallies for 3D models (issue #20), mirroring the asset index. */
  meshes?: number;
  materials?: number;
  textures?: number;
  skins?: number;
  joints?: number;
  /** Whether the generated model carries PBR texture output. */
  pbr?: boolean;
  /** Requested provider face target for generated models. */
  faceCount?: number;
  /** Preserved raw/optimized model lineage and the optimization report used at registration. */
  modelTrace?: ModelTrace;
  /** Non-blocking color-quality evidence emitted by the optional soft-grade pass. */
  colorGrade?: ColorGradeTrace;
  /** Required provenance/license record (issue #17): no generator may skip this. */
  license: AssetLicenseRecord;
}

export interface ColorGradeTrace {
  applied: true;
  advisory: true;
  blocking: false;
  /** Relative path to the structured color-gamut report. */
  report: string;
  /** Visible source-pixel share outside the canonical value/temperature range. */
  outOfGamutRatio: number;
  /** True when the out-of-range share crosses the canonical materiality threshold. */
  material: boolean;
}

export interface ModelTrace {
  report: string;
  source: string;
  /** Raw provider response for generation audits and reproducibility. */
  prediction?: string;
  sourceSha256: string;
  optimizedSha256: string;
}

/** What the mandatory gltf-transform optimize actually applied to a 3D model (issue #20). */
export interface ModelCompression {
  /** Draco geometry compression (KHR_draco_mesh_compression) applied. */
  draco: boolean;
  /** KTX2 / Basis texture supercompression applied (encoder-gated; see model3d). */
  ktx2: boolean;
  /** Final embedded-texture container: "ktx2", "webp", or "none" when the model has no textures. */
  textureFormat: "ktx2" | "webp" | "none";
  /** Raw GLB byte size as produced by the provider, before optimize. */
  rawBytes: number;
  /** Optimized GLB byte size written to disk. */
  optimizedBytes: number;
}

/** Rig/skeleton provenance for a generated 3D model (issue #20 `license.rig`). */
export interface AssetRigLicense {
  /** `none`/`unknown`, generated provider provenance, or an `operator-asserted:*` import value. */
  source: string;
  /** Whether the model carries a skin/skeleton. */
  rigged: boolean;
  /** Joint count in the skeleton. */
  joints: number;
  /** Animation clip names bundled with the rig. */
  animations: string[];
}

export interface AssetLicenseRecord {
  /** Generation or conversion tool, e.g. "codex", "openai", "ffmpeg". */
  tool: string;
  /** Tool plan/model/preset used for reviewable provenance. */
  plan: string;
  /** ISO calendar date when the final asset was produced. */
  date: string;
  /** Asset kind covered by this license/provenance record. */
  kind: string;
  /** Optional AI-generation disclosure (issue #19 sprites / #59 legal). */
  type?: string;
  terms?: string;
  url?: string;
  generatedAt?: string;
  /** Rig/skeleton provenance for generated 3D models (issue #20). */
  rig?: AssetRigLicense;
}

/** Required provenance fields; every registered asset must carry all four. */
export const REQUIRED_LICENSE_FIELDS = ["tool", "plan", "date", "kind"] as const;

/** Upsert an asset entry into a game's assets.json (single source of truth). */
export async function register(manifestPath: string, entry: AssetEntry): Promise<void> {
  assertLicenseRecord(entry);
  let data: { assets: AssetEntry[] } = { assets: [] };
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
    if (Array.isArray(parsed.assets)) data = parsed;
  } catch {
    /* new manifest */
  }
  const i = data.assets.findIndex((a) => a.id === entry.id && a.kind === entry.kind);
  if (i >= 0) data.assets[i] = entry;
  else data.assets.push(entry);
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(data, null, 2) + "\n");
}

/** Required license fields the entry is missing or left blank (empty when fully licensed). */
export function missingLicenseFields(entry: AssetEntry): (typeof REQUIRED_LICENSE_FIELDS)[number][] {
  return REQUIRED_LICENSE_FIELDS.filter((field) => {
    const value = entry.license?.[field];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

/** Throw unless the entry carries a complete, non-empty license record. */
export function assertLicenseRecord(entry: AssetEntry): void {
  const missing = missingLicenseFields(entry);
  if (missing.length > 0) {
    throw new Error(`asset manifest entry ${entry.id}:${entry.kind} requires license.${missing[0]}`);
  }
}
