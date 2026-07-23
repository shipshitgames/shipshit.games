import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import sharp from "sharp";

import { CATALOG_FILE } from "./assets-package.ts";
import type { AssetLicenseRecord } from "./manifest.ts";
import {
  generateOne,
  licenseForGeneration,
  withUsageAccounting,
} from "./pipeline.ts";
import { DOOM_RAMP, pixelize } from "./pixelize.ts";
import type { AssetProvenance } from "./provenance.ts";
import { STYLE_SUFFIX } from "./style.ts";

export const POSE_SET_VERSION = 1;
export const CANONICAL_POSES = [
  "idle",
  "walk",
  "attack",
  "hit",
  "death",
] as const;

export type CanonicalPose = (typeof CANONICAL_POSES)[number];

export interface PoseSetSource {
  assetId: string;
  image: string;
  sha256: string;
  catalog: string;
  dimensions: [number, number];
}

export interface PoseSetDesignLock {
  tokenSource: "DESIGN.md#assetgen";
  styleSuffixHash: string;
  palette: "doom";
  paletteColors: string[];
  proportions: "source-reference-locked";
}

export interface PoseSetPose {
  image: string;
  sha256: string;
  dimensions: [number, number];
  prompt: string;
  provenance: AssetProvenance;
  license: AssetLicenseRecord;
}

export interface PoseSetManifest {
  $schema: string;
  schemaVersion: typeof POSE_SET_VERSION;
  entityId: string;
  game: string;
  source: PoseSetSource;
  design: PoseSetDesignLock;
  poses: Record<CanonicalPose, PoseSetPose>;
  generatedAt: string;
}

export interface PoseGeneratorArgs {
  entityId: string;
  game: string;
  pose: CanonicalPose;
  prompt: string;
  sourcePath: string;
  provider: string;
  model?: string;
  size: number;
  height: number;
  seed?: number;
  now: Date;
  log: (chunk: string) => void;
}

export interface GeneratedPose {
  data: Buffer;
  provider: string;
  model?: string;
  provenance: AssetProvenance;
}

export type PoseGenerator = (args: PoseGeneratorArgs) => Promise<GeneratedPose>;

export interface GeneratePoseSetOptions {
  assetsDir: string;
  entityId: string;
  game: string;
  provider: string;
  model?: string;
  size: number;
  height: number;
  seed?: number;
  licenseTerms?: string;
  licenseUrl?: string;
  usageLogPath?: string | null;
  dryRun?: boolean;
  now?: () => Date;
  generate?: PoseGenerator;
  log?: (chunk: string) => void;
}

export interface GeneratePoseSetResult {
  written: boolean;
  manifestPath: string;
  manifestRelPath: string;
  sourcePath: string;
  manifest: PoseSetManifest;
}

interface CatalogEntityRecord {
  id: string;
  promptBase: string;
  variants: Record<string, unknown>;
}

const POSE_DIRECTIONS: Record<CanonicalPose, string> = {
  idle: "neutral ready stance, balanced weight, limbs separated and silhouette unobstructed",
  walk: "clear mid-stride locomotion pose, opposite arm and leg forward, readable contact and passing motion",
  attack:
    "maximum readable attack key pose with the primary striking limb or weapon fully committed",
  hit: "compact impact recoil pose, center of mass displaced but anatomy still readable",
  death:
    "terminal collapse key pose, unmistakably defeated without gore hiding the silhouette",
};

const defaultPoseGenerator: PoseGenerator = async (args) => {
  const result = await generateOne({
    id: `${args.entityId}-${args.pose}`,
    prompt: args.prompt,
    game: args.game,
    kind: "sprite",
    provider: args.provider,
    model: args.model,
    size: args.size,
    referenceImages: [args.sourcePath],
    seed: args.seed,
    now: () => args.now,
    postprocess: async (asset) => ({
      data: await gradePose(asset.data, args.height),
      mediaType: "image/webp",
      extension: "webp",
    }),
    log: args.log,
  });
  return {
    data: result.optimized.data,
    provider: result.generated.provider,
    model: result.generated.model,
    provenance: result.provenance,
  };
};

/** Generate the five canonical pose references from one promoted catalog variant. */
export async function generatePoseSet(
  options: GeneratePoseSetOptions,
): Promise<GeneratePoseSetResult> {
  assertSlug(options.entityId, "entity id");
  assertSlug(options.game, "game");
  const assetsDir = resolve(options.assetsDir);
  const catalogPath = resolve(assetsDir, CATALOG_FILE);
  const entity = await loadCatalogEntity(catalogPath, options.entityId);
  const sourceRelPath = promotedVariantPath(entity, options.game);
  const sourcePath = resolveContained(
    assetsDir,
    sourceRelPath,
    "promoted source image",
  );
  if (!existsSync(sourcePath))
    throw new Error(`promoted source image not found: ${sourcePath}`);
  const sourceData = await readFile(sourcePath);
  const sourceMeta = await sharp(sourceData).metadata();
  if (!sourceMeta.width || !sourceMeta.height)
    throw new Error(`promoted source is not a readable image: ${sourcePath}`);

  const log = options.log ?? (() => {});
  const generate = options.generate ?? defaultPoseGenerator;
  const stamp = options.now?.() ?? new Date();
  const setRootRel = `sources/pose-sets/${options.entityId}/${options.game}`;
  const setRoot = resolveContained(assetsDir, setRootRel, "pose-set output");
  const manifestRelPath = `${setRootRel}/pose-set.json`;
  const manifestPath = resolveContained(
    assetsDir,
    manifestRelPath,
    "pose-set manifest",
  );
  const poses = {} as Record<CanonicalPose, PoseSetPose>;
  const generatedFiles: Array<{ path: string; data: Buffer }> = [];

  for (let index = 0; index < CANONICAL_POSES.length; index++) {
    const pose = CANONICAL_POSES[index]!;
    const prompt = posePrompt(entity, pose);
    const imageRelPath = `${setRootRel}/${pose}.webp`;
    const imagePath = resolveContained(assetsDir, imageRelPath, `pose ${pose}`);
    let usedProvider = options.provider;
    let usedModel = options.model;
    const generatedResult = await withUsageAccounting(
      {
        usageLogPath: options.usageLogPath,
        log,
        logStyle: "stream",
        event: () => ({
          command: "pose-set",
          provider: usedProvider,
          kind: "pose-reference",
          game: options.game,
          id: `${options.entityId}-${pose}`,
          model: usedModel,
          size: options.size,
          outputPath: options.dryRun ? undefined : imagePath,
          prompt,
        }),
      },
      async () => {
        const result = await generate({
          entityId: options.entityId,
          game: options.game,
          pose,
          prompt,
          sourcePath,
          provider: options.provider,
          model: options.model,
          size: options.size,
          height: options.height,
          seed: options.seed === undefined ? undefined : options.seed + index,
          now: stamp,
          log,
        });
        usedProvider = result.provider;
        usedModel = result.model;
        return {
          generated: result,
          dimensions: await inspectPoseOutput(result.data, pose),
        };
      },
    );
    const { generated, dimensions } = generatedResult;
    const license: AssetLicenseRecord = {
      ...licenseForGeneration({
        provider: generated.provider,
        model: generated.model,
        kind: "pose-reference",
        date: stamp,
      }),
      type: "ai-generated",
      terms:
        options.licenseTerms ??
        "review required before shipping derived animation",
      ...(options.licenseUrl ? { url: options.licenseUrl } : {}),
      generatedAt: stamp.toISOString(),
    };
    poses[pose] = {
      image: imageRelPath,
      sha256: sha256(generated.data),
      dimensions,
      prompt,
      provenance: generated.provenance,
      license,
    };
    generatedFiles.push({ path: imagePath, data: generated.data });
  }

  const manifest: PoseSetManifest = {
    $schema: "https://shipshit.games/schemas/pose-set.schema.json",
    schemaVersion: POSE_SET_VERSION,
    entityId: options.entityId,
    game: options.game,
    source: {
      assetId: options.entityId,
      image: sourceRelPath,
      sha256: sha256(sourceData),
      catalog: CATALOG_FILE,
      dimensions: [sourceMeta.width, sourceMeta.height],
    },
    design: {
      tokenSource: "DESIGN.md#assetgen",
      styleSuffixHash: shortHash(STYLE_SUFFIX),
      palette: "doom",
      paletteColors: [...DOOM_RAMP],
      proportions: "source-reference-locked",
    },
    poses,
    generatedAt: stamp.toISOString(),
  };
  parsePoseSetManifest(manifest);

  if (sha256(await readFile(sourcePath)) !== manifest.source.sha256) {
    throw new Error(
      `promoted source changed while generating ${options.entityId}/${options.game}; no outputs were written`,
    );
  }

  if (options.dryRun) {
    log(
      `[pose-set] dry-run: planned ${CANONICAL_POSES.length} pose(s); skipping writes\n`,
    );
    return {
      written: false,
      manifestPath,
      manifestRelPath,
      sourcePath,
      manifest,
    };
  }

  await mkdir(setRoot, { recursive: true });
  for (const file of generatedFiles) {
    await writeFile(file.path, file.data);
    log(`[pose-set] wrote ${file.path}\n`);
  }
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  log(`[pose-set] manifest ${manifestPath}\n`);
  return { written: true, manifestPath, manifestRelPath, sourcePath, manifest };
}

/** Runtime authority paired with the published JSON Schema. */
export function parsePoseSetManifest(value: unknown): PoseSetManifest {
  const root = objectValue(value, "pose-set manifest");
  if (root.$schema !== "https://shipshit.games/schemas/pose-set.schema.json") {
    throw new Error("pose-set $schema is invalid");
  }
  if (root.schemaVersion !== POSE_SET_VERSION)
    throw new Error("pose-set schemaVersion must be 1");
  assertSlug(root.entityId, "pose-set entityId");
  assertSlug(root.game, "pose-set game");
  assertIsoDateTime(root.generatedAt, "pose-set generatedAt");

  const source = objectValue(root.source, "pose-set source");
  assertSlug(source.assetId, "pose-set source.assetId");
  assertSafePath(source.image, "pose-set source.image");
  assertSha256(source.sha256, "pose-set source.sha256");
  assertSafePath(source.catalog, "pose-set source.catalog");
  assertDimensions(source.dimensions, "pose-set source.dimensions");
  if (source.assetId !== root.entityId)
    throw new Error("pose-set source.assetId must match entityId");

  const design = objectValue(root.design, "pose-set design");
  if (design.tokenSource !== "DESIGN.md#assetgen")
    throw new Error("pose-set design.tokenSource is invalid");
  assertShortHash(design.styleSuffixHash, "pose-set design.styleSuffixHash");
  if (design.palette !== "doom")
    throw new Error("pose-set design.palette must be doom");
  if (
    !Array.isArray(design.paletteColors) ||
    design.paletteColors.length === 0
  ) {
    throw new Error("pose-set design.paletteColors must be a non-empty array");
  }
  for (const color of design.paletteColors) {
    if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      throw new Error(
        "pose-set design.paletteColors contains an invalid color",
      );
    }
  }
  if (design.proportions !== "source-reference-locked") {
    throw new Error("pose-set design.proportions is invalid");
  }

  const poses = objectValue(root.poses, "pose-set poses");
  const poseKeys = Object.keys(poses);
  if (
    poseKeys.length !== CANONICAL_POSES.length ||
    poseKeys.some((key) => !CANONICAL_POSES.includes(key as CanonicalPose))
  ) {
    throw new Error(
      `pose-set poses must contain exactly ${CANONICAL_POSES.join(", ")}`,
    );
  }
  for (const pose of CANONICAL_POSES) validatePose(poses[pose], pose);
  return value as PoseSetManifest;
}

function validatePose(value: unknown, pose: CanonicalPose): void {
  const entry = objectValue(value, `pose-set poses.${pose}`);
  assertSafePath(entry.image, `pose-set poses.${pose}.image`);
  assertSha256(entry.sha256, `pose-set poses.${pose}.sha256`);
  assertDimensions(entry.dimensions, `pose-set poses.${pose}.dimensions`);
  assertNonBlank(entry.prompt, `pose-set poses.${pose}.prompt`);
  const provenance = objectValue(
    entry.provenance,
    `pose-set poses.${pose}.provenance`,
  );
  assertNonBlank(
    provenance.provider,
    `pose-set poses.${pose}.provenance.provider`,
  );
  if (typeof provenance.reproducible !== "boolean")
    throw new Error(
      `pose-set poses.${pose}.provenance.reproducible must be boolean`,
    );
  assertShortHash(
    provenance.promptHash,
    `pose-set poses.${pose}.provenance.promptHash`,
  );
  assertShortHash(
    provenance.styleSuffixHash,
    `pose-set poses.${pose}.provenance.styleSuffixHash`,
  );
  assertIsoDate(provenance.date, `pose-set poses.${pose}.provenance.date`);
  const license = objectValue(entry.license, `pose-set poses.${pose}.license`);
  for (const field of ["tool", "plan", "date", "kind"] as const) {
    assertNonBlank(license[field], `pose-set poses.${pose}.license.${field}`);
  }
  assertIsoDate(license.date, `pose-set poses.${pose}.license.date`);
  if (license.kind !== "pose-reference")
    throw new Error(
      `pose-set poses.${pose}.license.kind must be pose-reference`,
    );
}

async function loadCatalogEntity(
  catalogPath: string,
  entityId: string,
): Promise<CatalogEntityRecord> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(catalogPath, "utf8"));
  } catch {
    throw new Error(`asset catalog not found or invalid: ${catalogPath}`);
  }
  const root = objectValue(parsed, "asset catalog");
  if (!Array.isArray(root.entities))
    throw new Error(`asset catalog has no entities array: ${catalogPath}`);
  const matches = root.entities.filter(
    (entry) => objectValue(entry, "catalog entity").id === entityId,
  );
  if (matches.length !== 1)
    throw new Error(
      `asset catalog must contain exactly one entity ${entityId}`,
    );
  const entity = objectValue(matches[0], `catalog entity ${entityId}`);
  assertNonBlank(entity.promptBase, `catalog entity ${entityId}.promptBase`);
  objectValue(entity.variants, `catalog entity ${entityId}.variants`);
  return entity as unknown as CatalogEntityRecord;
}

function promotedVariantPath(
  entity: CatalogEntityRecord,
  game: string,
): string {
  const value = entity.variants[game];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `entity ${entity.id} has no promoted local ${game} variant in ${CATALOG_FILE}`,
    );
  }
  assertSafePath(value, `catalog variant ${entity.id}.${game}`);
  return value;
}

function posePrompt(entity: CatalogEntityRecord, pose: CanonicalPose): string {
  return `${entity.promptBase}. Repose the exact entity from the supplied promoted source image into its canonical ${pose} reference: ${POSE_DIRECTIONS[pose]}. Preserve the source character's identity, anatomy, limb lengths, body mass, proportions, silhouette motifs, palette, materials, markings, and parasite-host takeover details exactly. Full body, single subject, transparent background, no props or scenery unless already fused to the entity`;
}

async function gradePose(data: Buffer, height: number): Promise<Buffer> {
  try {
    return await pixelize(data, { height, palette: DOOM_RAMP });
  } catch {
    // A flat dark mock frame can be entirely removed by the background cutout.
    // Preserve it for offline fixtures while still enforcing the exact palette.
    return pixelize(data, {
      height,
      palette: DOOM_RAMP,
      cutout: "none",
      trim: false,
    });
  }
}

async function inspectPoseOutput(
  data: Buffer,
  pose: CanonicalPose,
): Promise<[number, number]> {
  const image = sharp(data);
  const metadata = await image.metadata();
  if (metadata.format !== "webp" || !metadata.width || !metadata.height) {
    throw new Error(`generated ${pose} pose must be a readable WebP image`);
  }
  const raw = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const allowed = new Set(DOOM_RAMP.map((color) => color.toLowerCase()));
  for (let offset = 0; offset < raw.data.length; offset += raw.info.channels) {
    const alpha = raw.data[offset + 3] ?? 255;
    if (alpha === 0) continue;
    const color = `#${[
      raw.data[offset],
      raw.data[offset + 1],
      raw.data[offset + 2],
    ]
      .map((channel) => (channel ?? 0).toString(16).padStart(2, "0"))
      .join("")}`;
    if (!allowed.has(color))
      throw new Error(
        `generated ${pose} pose contains out-of-palette color ${color}`,
      );
  }
  return [metadata.width, metadata.height];
}

function resolveContained(root: string, path: string, label: string): string {
  assertSafePath(path, label);
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel))
    throw new Error(`${label} escapes the asset package`);
  return target;
}

function assertSafePath(
  value: unknown,
  label: string,
): asserts value is string {
  assertNonBlank(value, label);
  if (
    isAbsolute(value) ||
    value.includes("\\") ||
    value.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new Error(`${label} must be a safe asset-package-relative path`);
  }
}

function assertSlug(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value)
  ) {
    throw new Error(
      `${label} must use lowercase letters, digits, dots, dashes, or underscores`,
    );
  }
}

function assertNonBlank(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`${label} must be a non-empty string`);
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value))
    throw new Error(`${label} must be a sha256 hex digest`);
}

function assertShortHash(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{16}$/.test(value))
    throw new Error(`${label} must be a 16-character hex digest`);
}

function assertDimensions(
  value: unknown,
  label: string,
): asserts value is [number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some((dimension) => !Number.isInteger(dimension) || dimension <= 0)
  ) {
    throw new Error(`${label} must contain two positive integers`);
  }
}

function assertIsoDate(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error(`${label} must be an ISO date`);
}

function assertIsoDateTime(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    throw new Error(`${label} must be an ISO timestamp`);
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function shortHash(value: string): string {
  return sha256(Buffer.from(value)).slice(0, 16);
}
