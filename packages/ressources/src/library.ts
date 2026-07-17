import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  DerivativeKind,
  DerivativeManifest,
  SourceManifest,
  SyncedChannelVideos,
  SyncedVideo,
  TranscriptResource,
} from "./types";
import {
  derivativesDir,
  packageRoot,
  relativeToPackage,
  schemasDir,
  sourcesDir,
  transcriptsDir,
} from "./paths";
import { validateValue, type JsonSchema } from "./schema";
import { execYtDlp, parseVideoId, parseYtDlpVideo, ytDlpAvailable } from "./ytdlp";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  counts: {
    sources: number;
    transcripts: number;
    derivatives: number;
  };
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string): Promise<T> {
  const text = await readFile(path, "utf8");
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`${path}: ${(error as Error).message}`);
  }
}

/** A non-null, non-array object — the only shape the semantic checks may dereference. */
function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function listJsonFiles(root: string, suffix = ".json"): Promise<string[]> {
  if (!(await exists(root))) return [];
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(suffix)) out.push(path);
    }
  }
  await walk(root);
  return out.sort();
}

async function loadSchema(dir: string, name: string): Promise<JsonSchema> {
  return readJson<JsonSchema>(resolve(dir, name));
}

export async function loadSources(dir: string = sourcesDir): Promise<SourceManifest[]> {
  const files = await listJsonFiles(dir);
  const sourceFiles = files.filter((file) => file.endsWith("/source.json"));
  return Promise.all(sourceFiles.map((file) => readJson<SourceManifest>(file)));
}

export async function findSource(slug: string): Promise<SourceManifest | undefined> {
  const sources = await loadSources();
  return sources.find((source) => source.slug === slug);
}

export async function loadTranscripts(dir: string = transcriptsDir): Promise<TranscriptResource[]> {
  const files = await listJsonFiles(dir, ".resource.json");
  return Promise.all(files.map((file) => readJson<TranscriptResource>(file)));
}

export async function loadDerivatives(dir: string = derivativesDir): Promise<DerivativeManifest[]> {
  const files = await listJsonFiles(dir, ".resource.json");
  return Promise.all(files.map((file) => readJson<DerivativeManifest>(file)));
}

/**
 * Stable, human-readable label for a manifest, read safely from the value
 * itself (a null/scalar manifest has no `.slug` to dereference) and falling
 * back to an indexed label when the slug is missing or not a usable string.
 */
function manifestLabel(value: unknown, kind: string, index: number): string {
  const slug = isPlainObject(value) ? (value as Record<string, unknown>).slug : undefined;
  return typeof slug === "string" && slug.length > 0 ? slug : `${kind}[${index}]`;
}

export function canStoreRawTranscript(
  source: Pick<SourceManifest, "rights">,
  transcript: Pick<TranscriptResource, "rights">,
): boolean {
  return source.rights.storeRawTranscript && transcript.rights.status !== "unknown";
}

export interface ValidateOptions {
  /** Directory scanned for `source.json` manifests. Defaults to the package `sources/`. */
  sourcesDir?: string;
  /** Directory scanned for transcript `*.resource.json` sidecars. Defaults to the package `transcripts/`. */
  transcriptsDir?: string;
  /** Directory scanned for derivative `*.resource.json` manifests. Defaults to the package `derivatives/`. */
  derivativesDir?: string;
  /** Base directory used to resolve manifest-relative file paths. Defaults to the package root. */
  contentRoot?: string;
  /** Directory holding the canonical JSON Schemas. Defaults to the package `schemas/`. */
  schemasDir?: string;
}

export async function validateLibrary(options: ValidateOptions = {}): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const srcDir = options.sourcesDir ?? sourcesDir;
  const txDir = options.transcriptsDir ?? transcriptsDir;
  const dvDir = options.derivativesDir ?? derivativesDir;
  const contentRoot = options.contentRoot ?? packageRoot;
  const schemaDir = options.schemasDir ?? schemasDir;

  const [sourceSchema, transcriptSchema, derivativeSchema] = await Promise.all([
    loadSchema(schemaDir, "source.schema.json"),
    loadSchema(schemaDir, "transcript-resource.schema.json"),
    loadSchema(schemaDir, "derivative.schema.json"),
  ]);

  const toContentRelative = (absolute: string): string =>
    absolute.startsWith(contentRoot) ? absolute.slice(contentRoot.length + 1) : absolute;

  const sources = await loadSources(srcDir);
  const sourceSlugs = new Set<string>();
  const sourcesBySlug = new Map<string, SourceManifest>();

  sources.forEach((source, index) => {
    const label = manifestLabel(source, "source", index);
    // Shape validation is driven entirely by the published schema.
    errors.push(...validateValue(source, sourceSchema, label));
    // The schema already reported the wrong shape; don't deref a non-object.
    if (!isPlainObject(source)) return;

    // Conditional rule the schema subset cannot express (if/then):
    // raw storage requires a known transcript policy.
    if (
      source.rights &&
      typeof source.rights === "object" &&
      source.rights.storeRawTranscript === true &&
      source.rights.transcriptPolicy === "unknown"
    ) {
      errors.push(`${label}.rights cannot allow raw transcript storage with an unknown transcript policy`);
    }

    if (typeof source.slug === "string" && source.slug.length > 0) {
      if (sourceSlugs.has(source.slug)) errors.push(`duplicate source slug: ${source.slug}`);
      sourceSlugs.add(source.slug);
      sourcesBySlug.set(source.slug, source);
    }

    if (source.kind === "youtube-channel" && !source.channelId) {
      warnings.push(`${label} is a YouTube channel without channelId`);
    }
  });

  const transcripts = await loadTranscripts(txDir);
  for (const [index, transcript] of transcripts.entries()) {
    const label = manifestLabel(transcript, "transcript", index);
    errors.push(...validateValue(transcript, transcriptSchema, label));
    if (!isPlainObject(transcript)) continue;

    if (typeof transcript.sourceSlug === "string" && !sourceSlugs.has(transcript.sourceSlug)) {
      errors.push(`${label} references unknown source ${transcript.sourceSlug}`);
    }

    let transcriptExists = false;
    const hasTranscriptPath =
      typeof transcript.transcriptPath === "string" && transcript.transcriptPath.length > 0;
    const hasTranscriptFormat =
      typeof transcript.transcriptFormat === "string" && transcript.transcriptFormat.length > 0;
    if (hasTranscriptPath !== hasTranscriptFormat) {
      errors.push(`${label} must set transcriptPath and transcriptFormat together`);
    }
    if (hasTranscriptPath) {
      transcriptExists = await exists(resolve(contentRoot, transcript.transcriptPath));
      if (!transcriptExists) {
        errors.push(`${label} transcriptPath does not exist: ${transcript.transcriptPath}`);
      }
    }

    // Referential + business rules layered on top of the schema pass.
    if (transcript.rights?.status === "unknown") {
      warnings.push(`${label} has unknown transcript rights`);
    }
    const source = sourcesBySlug.get(transcript.sourceSlug);
    // Only apply the cross-file raw-storage rule when both rights objects are
    // well-formed. A source with a valid slug (so it lands in sourcesBySlug) but a
    // missing/non-object `rights` already produced a "rights is required"/type error
    // from the schema pass above; calling canStoreRawTranscript on it would
    // dereference `source.rights.storeRawTranscript` and crash the whole run with an
    // uncaught TypeError. Skipping keeps the schema diagnostics actionable and avoids
    // double-reporting the same problem.
    if (
      source &&
      transcriptExists &&
      isPlainObject(source.rights) &&
      isPlainObject(transcript.rights) &&
      !canStoreRawTranscript(source, transcript)
    ) {
      errors.push(
        `${label} stores raw transcript text, but ${source.slug}.rights.storeRawTranscript is false or transcript rights are unknown`,
      );
    }
  }

  const derivatives = await loadDerivatives(dvDir);
  const transcriptPaths = new Set(
    transcripts
      .filter(
        (transcript): transcript is TranscriptResource & { transcriptPath: string } =>
          typeof transcript?.transcriptPath === "string" && transcript.transcriptPath.length > 0,
      )
      .map((transcript) => toContentRelative(resolve(contentRoot, transcript.transcriptPath))),
  );
  const transcriptSidecars = new Set(
    transcripts
      .filter((transcript) => typeof transcript?.sourceSlug === "string" && typeof transcript?.slug === "string")
      .map((transcript) =>
        toContentRelative(resolve(txDir, transcript.sourceSlug, `${transcript.slug}.resource.json`)),
      ),
  );

  for (const [index, derivative] of derivatives.entries()) {
    const label = manifestLabel(derivative, "derivative", index);
    errors.push(...validateValue(derivative, derivativeSchema, label));
    if (!isPlainObject(derivative)) continue;

    const sourceTranscripts = Array.isArray(derivative.sourceTranscripts) ? derivative.sourceTranscripts : [];
    for (const sourceTranscript of sourceTranscripts) {
      if (!transcriptPaths.has(sourceTranscript) && !transcriptSidecars.has(sourceTranscript)) {
        warnings.push(`${label} references a transcript not indexed yet: ${sourceTranscript}`);
      }
    }

    if (typeof derivative.outputPath === "string" && derivative.outputPath.length > 0) {
      if (!(await exists(resolve(contentRoot, derivative.outputPath)))) {
        errors.push(`${label} outputPath does not exist: ${derivative.outputPath}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    counts: {
      sources: sources.length,
      transcripts: transcripts.length,
      derivatives: derivatives.length,
    },
  };
}

export interface NewTranscriptInput {
  sourceSlug: string;
  url: string;
  title: string;
  slug?: string;
  rightsStatus?: TranscriptResource["rights"]["status"];
  force?: boolean;
}

export async function createTranscriptResource(input: NewTranscriptInput): Promise<TranscriptResource> {
  const source = await findSource(input.sourceSlug);
  if (!source) throw new Error(`unknown source: ${input.sourceSlug}`);

  const videoId = parseVideoId(input.url);
  const slug = slugify(input.slug ?? input.title ?? videoId ?? "transcript");
  if (!slug) throw new Error("could not derive transcript slug");

  const dir = resolve(transcriptsDir, source.slug);
  const transcriptPath = resolve(dir, `${slug}.transcript.md`);
  const sidecarPath = resolve(dir, `${slug}.resource.json`);
  if (!input.force && ((await exists(transcriptPath)) || (await exists(sidecarPath)))) {
    throw new Error(`transcript already exists for ${source.slug}/${slug}; pass --force to overwrite`);
  }

  const transcriptText = [
    `# ${input.title}`,
    "",
    `Source: ${input.url}`,
    `Source library: ${source.slug}`,
    "",
    "<!-- Drop the authorized transcript text below this line. -->",
    "",
  ].join("\n");

  const sidecar: TranscriptResource = {
    schemaVersion: 1,
    slug,
    sourceSlug: source.slug,
    sourceKind: "youtube-video",
    title: input.title,
    url: input.url,
    capturedAt: new Date().toISOString(),
    transcriptPath: relativeToPackage(transcriptPath),
    transcriptFormat: "markdown",
    rights: {
      status: input.rightsStatus ?? source.rights.transcriptPolicy,
      notes: "Transcript placeholder created by @shipshitgames/ressources. Confirm rights before committing raw text.",
    },
    tags: source.topics,
    derivatives: {
      skillCandidates: [],
      appCandidates: [],
      toolCandidates: [],
    },
  };

  await mkdir(dir, { recursive: true });
  await writeFile(transcriptPath, transcriptText, "utf8");
  await writeJson(sidecarPath, sidecar);
  return sidecar;
}

export interface NewDerivativeInput {
  kind: DerivativeKind;
  slug: string;
  title: string;
  sourceTranscripts: string[];
  summary?: string;
  force?: boolean;
}

function derivativeDir(kind: DerivativeKind): string {
  return resolve(derivativesDir, kind === "rule" ? "rules" : `${kind}s`);
}

export async function createDerivative(input: NewDerivativeInput): Promise<DerivativeManifest> {
  const dir = derivativeDir(input.kind);
  const slug = slugify(input.slug);
  if (!slug) throw new Error("derivative slug is required");

  const outputPath = resolve(dir, `${slug}.md`);
  const sidecarPath = resolve(dir, `${slug}.resource.json`);
  if (!input.force && ((await exists(outputPath)) || (await exists(sidecarPath)))) {
    throw new Error(`derivative already exists: ${relativeToPackage(outputPath)}; pass --force to overwrite`);
  }

  const summary = input.summary ?? "Candidate distilled from source transcripts. Review before promoting.";
  const body = [
    `# ${input.title}`,
    "",
    `Status: candidate`,
    `Kind: ${input.kind}`,
    "",
    "## Source Transcripts",
    "",
    ...input.sourceTranscripts.map((sourceTranscript) => `- ${sourceTranscript}`),
    "",
    "## Why This Matters",
    "",
    summary,
    "",
    "## Reusable Pattern",
    "",
    "- Capture the source-specific technique in original words.",
    "- Convert tutorial steps into repo-native game-building rules.",
    "- Name the concrete Ship Shit Games package, app, or tool this should affect.",
    "",
    "## Implementation Notes",
    "",
    "- Pending review.",
    "",
  ].join("\n");

  const manifest: DerivativeManifest = {
    schemaVersion: 1,
    slug,
    kind: input.kind,
    title: input.title,
    status: "candidate",
    sourceTranscripts: input.sourceTranscripts,
    outputPath: relativeToPackage(outputPath),
    summary,
    tags: [],
  };

  await mkdir(dir, { recursive: true });
  await writeFile(outputPath, body, "utf8");
  await writeJson(sidecarPath, manifest);
  return manifest;
}

export async function syncChannelVideos(sourceSlug: string, limit: number): Promise<SyncedChannelVideos> {
  const source = await findSource(sourceSlug);
  if (!source) throw new Error(`unknown source: ${sourceSlug}`);
  if (source.kind !== "youtube-channel") throw new Error(`${sourceSlug} is not a youtube-channel source`);
  if (!(await ytDlpAvailable())) {
    throw new Error("yt-dlp is not installed; install it to sync channel video metadata");
  }

  const sourceUrl = source.url.endsWith("/videos") ? source.url : `${source.url}/videos`;
  const args = ["--flat-playlist", "--dump-single-json"];
  if (Number.isFinite(limit) && limit > 0) args.push("--playlist-end", String(limit));
  args.push(sourceUrl);

  const { stdout } = await execYtDlp(args, {
    timeout: 180_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(stdout) as { entries?: Record<string, unknown>[] };
  const videos = (parsed.entries ?? [])
    .map(parseYtDlpVideo)
    .filter((video): video is SyncedVideo => Boolean(video));

  const synced: SyncedChannelVideos = {
    schemaVersion: 1,
    sourceSlug: source.slug,
    syncedAt: new Date().toISOString(),
    via: "yt-dlp",
    videos,
  };

  await writeJson(resolve(sourcesDir, source.slug, "videos.json"), synced);
  return synced;
}
