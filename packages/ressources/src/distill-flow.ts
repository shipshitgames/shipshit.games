import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { distill } from "./distill";
import {
  canStoreRawTranscript,
  loadSources,
  pathExists,
  readJson,
  slugify,
  writeJson,
} from "./library";
import { isPathInside, packageRoot, relativeToRoot } from "./paths";
import {
  isDuplicatePolicy,
  isTranscriptRightsStatus,
  type DuplicatePolicy,
  type DerivativeManifest,
  type SourceKind,
  type SourceManifest,
  type TranscriptResource,
  type TranscriptRightsStatus,
} from "./types";
import { parseVideoId } from "./ytdlp";

export interface DistillSourceInput {
  sourceSlug: string;
  transcript: string;
  title: string;
  url?: string;
  slug?: string;
  provider?: string;
  rightsStatus: TranscriptRightsStatus;
  rightsExplicit?: boolean;
  outTranscriptPath?: string;
  duplicatePolicy?: DuplicatePolicy;
  root?: string;
  source?: SourceManifest;
  log?: (message: string) => void;
}

export interface DistillSourceResult {
  status: "created" | "updated" | "overwritten" | "skipped" | "versioned";
  slug: string;
  transcriptSidecarPath: string;
  transcriptPath?: string;
  rulesPath: string;
  rulesSidecarPath: string;
  transcriptResource?: TranscriptResource;
  derivativeManifest?: DerivativeManifest;
}

interface ArtifactPaths {
  slug: string;
  transcriptSidecarPath: string;
  transcriptPath?: string;
  rulesPath: string;
  rulesSidecarPath: string;
}

interface ExistingTranscriptState {
  resource?: TranscriptResource;
  linkedTranscriptPath?: string;
  effectiveRights: TranscriptResource["rights"];
}

function withVersion(path: string, version: number): string {
  if (path.endsWith(".transcript.md")) {
    return `${path.slice(0, -".transcript.md".length)}-v${version}.transcript.md`;
  }
  const extension = extname(path);
  return extension
    ? `${path.slice(0, -extension.length)}-v${version}${extension}`
    : `${path}-v${version}`;
}

function artifactPaths(
  root: string,
  sourceSlug: string,
  baseSlug: string,
  outTranscriptPath: string | undefined,
  version?: number,
): ArtifactPaths {
  const slug = version ? `${baseSlug}-v${version}` : baseSlug;
  const transcriptDir = resolve(root, "transcripts", sourceSlug);
  const rulesDir = resolve(root, "derivatives", "rules");
  return {
    slug,
    transcriptSidecarPath: resolve(transcriptDir, `${slug}.resource.json`),
    transcriptPath: outTranscriptPath
      ? version
        ? withVersion(outTranscriptPath, version)
        : outTranscriptPath
      : undefined,
    rulesPath: resolve(rulesDir, `${slug}.md`),
    rulesSidecarPath: resolve(rulesDir, `${slug}.resource.json`),
  };
}

async function collides(paths: ArtifactPaths): Promise<boolean> {
  const candidates = [
    paths.transcriptSidecarPath,
    paths.transcriptPath,
    paths.rulesPath,
    paths.rulesSidecarPath,
  ].filter((path): path is string => Boolean(path));
  return (await Promise.all(candidates.map(pathExists))).some(Boolean);
}

async function readJsonIfExists<T>(path: string): Promise<T | undefined> {
  if (!(await pathExists(path))) return undefined;
  try {
    return await readJson<T>(path);
  } catch (error) {
    throw new Error(`could not read existing metadata ${path}: ${(error as Error).message}`);
  }
}

async function inspectExistingTranscript(input: {
  root: string;
  source: SourceManifest;
  sourceTranscriptsDir: string;
  paths: ArtifactPaths;
  requestedRights: TranscriptResource["rights"];
  rightsExplicit: boolean;
  incomingTranscript: string;
}): Promise<ExistingTranscriptState> {
  const {
    root,
    source,
    sourceTranscriptsDir,
    paths,
    requestedRights,
    rightsExplicit,
    incomingTranscript,
  } = input;
  const resource = await readJsonIfExists<TranscriptResource>(paths.transcriptSidecarPath);
  const existingPath = resource?.transcriptPath
    ? resolve(root, resource.transcriptPath)
    : undefined;
  if (
    existingPath &&
    (!isPathInside(sourceTranscriptsDir, existingPath) ||
      !existingPath.endsWith(".transcript.md"))
  ) {
    throw new Error(
      `existing transcriptPath must be a *.transcript.md file inside transcripts/${source.slug}`,
    );
  }

  const linkedTranscriptPath =
    existingPath && (await pathExists(existingPath)) ? existingPath : undefined;
  if (
    linkedTranscriptPath &&
    paths.transcriptPath &&
    linkedTranscriptPath !== paths.transcriptPath
  ) {
    throw new Error(
      "cannot replace a linked raw transcript path in place; use the existing path or versioned output",
    );
  }
  if (linkedTranscriptPath && !paths.transcriptPath) {
    const existingTranscript = (await readFile(linkedTranscriptPath, "utf8")).trim();
    if (existingTranscript !== incomingTranscript) {
      throw new Error(
        `incoming transcript differs from ${relativeToRoot(root, linkedTranscriptPath)}; ` +
          "pass the same path with --out-transcript to update provenance",
      );
    }
  }
  if (linkedTranscriptPath && !resource?.rights) {
    throw new Error(
      `existing transcript metadata is missing reviewed rights: ${paths.transcriptSidecarPath}`,
    );
  }

  const effectiveRights =
    !rightsExplicit && resource?.rights ? resource.rights : requestedRights;
  if (
    linkedTranscriptPath &&
    !canStoreRawTranscript(source, { rights: effectiveRights })
  ) {
    throw new Error(
      `raw transcript for ${source.slug}/${paths.slug} conflicts with effective reviewed rights`,
    );
  }
  return { resource, linkedTranscriptPath, effectiveRights };
}

async function availableVersionedPaths(
  root: string,
  sourceSlug: string,
  baseSlug: string,
  outTranscriptPath: string | undefined,
): Promise<ArtifactPaths> {
  let version = 2;
  let paths = artifactPaths(root, sourceSlug, baseSlug, outTranscriptPath, version);
  while (await collides(paths)) {
    version += 1;
    paths = artifactPaths(root, sourceSlug, baseSlug, outTranscriptPath, version);
  }
  return paths;
}

function transcriptSourceKind(sourceType: SourceKind, url: string): SourceKind {
  return parseVideoId(url) ? "youtube-video" : sourceType;
}

export async function distillSource(input: DistillSourceInput): Promise<DistillSourceResult> {
  const root = resolve(input.root ?? packageRoot);
  const source =
    input.source ??
    (await loadSources(resolve(root, "sources"))).find(
      (candidate) => candidate.slug === input.sourceSlug,
    );
  if (!source) throw new Error(`unknown source: ${input.sourceSlug}`);
  if (source.slug !== input.sourceSlug) {
    throw new Error(`resolved source slug ${source.slug} does not match ${input.sourceSlug}`);
  }

  const transcript = input.transcript.trim();
  if (!transcript) throw new Error("transcript text is empty");
  const title = input.title.trim();
  if (!title) throw new Error("transcript title is empty");

  const baseSlug = slugify(input.slug || title);
  if (!baseSlug) throw new Error("could not derive transcript slug");

  let url = input.url ?? source.url;
  const duplicatePolicy = input.duplicatePolicy ?? "skip";
  if (!isDuplicatePolicy(duplicatePolicy)) {
    throw new Error(`unknown duplicate policy: ${duplicatePolicy} (use skip | overwrite | versioned)`);
  }

  const outTranscriptPath = input.outTranscriptPath
    ? resolve(input.outTranscriptPath)
    : undefined;
  const sourceTranscriptsDir = resolve(root, "transcripts", source.slug);
  if (
    outTranscriptPath &&
    (!isPathInside(sourceTranscriptsDir, outTranscriptPath) ||
      !outTranscriptPath.endsWith(".transcript.md"))
  ) {
    throw new Error(
      `--out-transcript must be a *.transcript.md file inside transcripts/${source.slug}`,
    );
  }

  const requestedRights = {
    status: input.rightsStatus,
    notes: `Transcript provenance recorded by the source-aware distill flow (${input.rightsStatus}).`,
  };
  const rightsExplicit = input.rightsExplicit ?? true;
  if (!isTranscriptRightsStatus(input.rightsStatus)) {
    throw new Error(`unknown transcript rights status: ${input.rightsStatus}`);
  }
  if (outTranscriptPath && !rightsExplicit) {
    throw new Error("storing raw transcript text requires explicitly reviewed rights");
  }
  if (outTranscriptPath && !canStoreRawTranscript(source, { rights: requestedRights })) {
    throw new Error(
      `source ${source.slug} does not permit storing this raw transcript; ` +
        "omit --out-transcript or update reviewed rights metadata",
    );
  }

  let paths = artifactPaths(root, source.slug, baseSlug, outTranscriptPath);
  const baseCollision = await collides(paths);
  if (duplicatePolicy === "skip" && baseCollision) {
    input.log?.(`[distill] skipped existing artifacts for ${source.slug}/${baseSlug}`);
    return {
      status: "skipped",
      ...paths,
      transcriptPath: undefined,
    };
  }

  const baseExistingResource = await readJsonIfExists<TranscriptResource>(
    paths.transcriptSidecarPath,
  );
  let resultStatus: DistillSourceResult["status"] = "created";
  if (baseCollision && duplicatePolicy === "overwrite") {
    resultStatus = "overwritten";
  }
  if (baseCollision && duplicatePolicy === "versioned") {
    paths = await availableVersionedPaths(
      root,
      source.slug,
      baseSlug,
      outTranscriptPath,
    );
    resultStatus = "versioned";
  }

  const existingBeforeDistill = await inspectExistingTranscript({
    root,
    source,
    sourceTranscriptsDir,
    paths,
    requestedRights,
    rightsExplicit,
    incomingTranscript: transcript,
  });
  if (!input.url && (existingBeforeDistill.resource?.url || baseExistingResource?.url)) {
    url = existingBeforeDistill.resource?.url ?? baseExistingResource?.url ?? url;
  }

  const rules = await distill({
    transcript,
    title,
    url,
    provider: input.provider ?? "codex",
    log: input.log,
  });
  if (!rules.trim()) throw new Error("distillation produced empty rules");

  if (duplicatePolicy !== "overwrite" && (await collides(paths))) {
    if (duplicatePolicy === "skip") {
      input.log?.(
        `[distill] skipped artifacts created during distillation for ${source.slug}/${baseSlug}`,
      );
      return {
        status: "skipped",
        ...paths,
        transcriptPath: undefined,
      };
    }
    paths = await availableVersionedPaths(
      root,
      source.slug,
      baseSlug,
      outTranscriptPath,
    );
    resultStatus = "versioned";
  }

  const existingState = await inspectExistingTranscript({
    root,
    source,
    sourceTranscriptsDir,
    paths,
    requestedRights,
    rightsExplicit,
    incomingTranscript: transcript,
  });
  const existing = existingState.resource;
  const linkedRulesPath = existing?.derivatives?.rulesPath
    ? resolve(root, existing.derivatives.rulesPath)
    : undefined;
  if (
    linkedRulesPath &&
    (!isPathInside(resolve(root, "derivatives", "rules"), linkedRulesPath) ||
      !linkedRulesPath.endsWith(".md"))
  ) {
    throw new Error(
      `existing derivatives.rulesPath must be a Markdown file inside derivatives/rules`,
    );
  }
  if (linkedRulesPath) {
    paths = { ...paths, rulesPath: linkedRulesPath };
  }
  const existingDerivative = await readJsonIfExists<DerivativeManifest>(
    paths.rulesSidecarPath,
  );
  const transcriptPath = paths.transcriptPath ?? existingState.linkedTranscriptPath;
  const resourceUrl = input.url ?? existing?.url ?? url;
  if (
    transcriptPath &&
    !canStoreRawTranscript(source, { rights: existingState.effectiveRights })
  ) {
    throw new Error(
      `raw transcript for ${source.slug}/${paths.slug} conflicts with effective reviewed rights`,
    );
  }

  const capturedAt = new Date().toISOString();
  const transcriptSidecarRelative = relativeToRoot(root, paths.transcriptSidecarPath);
  const rulesRelative = relativeToRoot(root, paths.rulesPath);
  const transcriptResource: TranscriptResource = {
    schemaVersion: 1,
    slug: paths.slug,
    sourceSlug: source.slug,
    sourceKind:
      input.url || !existing?.sourceKind
        ? transcriptSourceKind(source.kind, resourceUrl)
        : existing.sourceKind,
    title,
    url: resourceUrl,
    capturedAt: paths.transcriptPath ? capturedAt : existing?.capturedAt ?? capturedAt,
    ...(transcriptPath
      ? {
          transcriptPath: relativeToRoot(root, transcriptPath),
          transcriptFormat: paths.transcriptPath
            ? ("markdown" as const)
            : existing?.transcriptFormat ?? ("markdown" as const),
        }
      : {}),
    rights: {
      status: existingState.effectiveRights.status,
      notes:
        existing?.rights?.status === existingState.effectiveRights.status
          ? existing.rights.notes
          : requestedRights.notes,
    },
    tags: existing?.tags ?? source.topics,
    derivatives: {
      rulesPath: existing?.derivatives?.rulesPath ?? rulesRelative,
      skillCandidates: existing?.derivatives?.skillCandidates ?? [],
      appCandidates: existing?.derivatives?.appCandidates ?? [],
      toolCandidates: existing?.derivatives?.toolCandidates ?? [],
    },
  };
  const derivativeManifest: DerivativeManifest = {
    schemaVersion: 1,
    slug: paths.slug,
    kind: "rule",
    title: existingDerivative?.title ?? title,
    status: existingDerivative?.status ?? "candidate",
    sourceTranscripts: [
      ...new Set([
        ...(existingDerivative?.sourceTranscripts ?? []),
        transcriptSidecarRelative,
      ]),
    ],
    ...(existingDerivative?.sourceRules
      ? { sourceRules: existingDerivative.sourceRules }
      : {}),
    outputPath: rulesRelative,
    summary:
      existingDerivative?.summary ??
      `Reusable rules distilled from ${title} in the ${source.title} source library.`,
    tags: existingDerivative?.tags ?? source.topics,
  };

  if (paths.transcriptPath) {
    await mkdir(dirname(paths.transcriptPath), { recursive: true });
    await writeFile(paths.transcriptPath, `${transcript}\n`, "utf8");
  }
  await mkdir(dirname(paths.rulesPath), { recursive: true });
  await writeFile(paths.rulesPath, rules, "utf8");
  await Promise.all([
    writeJson(paths.transcriptSidecarPath, transcriptResource),
    writeJson(paths.rulesSidecarPath, derivativeManifest),
  ]);

  input.log?.(`[transcript-resource] ${transcriptSidecarRelative}`);
  input.log?.(`[rules] ${rulesRelative}`);
  return {
    status: resultStatus,
    ...paths,
    transcriptPath,
    transcriptResource,
    derivativeManifest,
  };
}
