import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  DerivativeKind,
  DerivativeManifest,
  SourceManifest,
  SyncedChannelVideos,
  SyncedVideo,
  TranscriptResource,
  TranscriptRightsStatus,
} from "./types";
import { derivativesDir, packageRoot, relativeToPackage, sourcesDir, transcriptsDir } from "./paths";
import { execYtDlp, parseVideoId, parseYtDlpVideo, ytDlpAvailable } from "./ytdlp";

const TRANSCRIPT_RIGHTS_STATUSES = new Set<TranscriptRightsStatus>([
  "user-provided",
  "public-captions",
  "official-api",
  "permissioned",
  "unknown",
]);

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
  return JSON.parse(await readFile(path, "utf8")) as T;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim() === "") errors.push(`${label} must be a non-empty string`);
}

function requireStringArray(value: unknown, label: string, errors: string[]): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${label} must be an array of strings`);
  }
}

function requireTranscriptRightsStatus(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== "string" || !TRANSCRIPT_RIGHTS_STATUSES.has(value as TranscriptRightsStatus)) {
    errors.push(`${label} must be one of ${Array.from(TRANSCRIPT_RIGHTS_STATUSES).join(", ")}`);
  }
}

function validateSourceRights(source: SourceManifest, errors: string[]): void {
  const label = `${source.slug}.rights`;
  if (!source.rights || typeof source.rights !== "object") {
    errors.push(`${label} must be an object`);
    return;
  }

  requireTranscriptRightsStatus(source.rights.transcriptPolicy, `${label}.transcriptPolicy`, errors);
  if (typeof source.rights.storeRawTranscript !== "boolean") {
    errors.push(`${label}.storeRawTranscript must be a boolean`);
  }
  requireString(source.rights.notes, `${label}.notes`, errors);
  if (source.rights.storeRawTranscript && source.rights.transcriptPolicy === "unknown") {
    errors.push(`${label} cannot allow raw transcript storage with an unknown transcript policy`);
  }
}

function validateTranscriptRights(
  transcript: TranscriptResource,
  source: SourceManifest | undefined,
  transcriptExists: boolean,
  errors: string[],
  warnings: string[],
): void {
  const label = `${transcript.slug}.rights`;
  if (!transcript.rights || typeof transcript.rights !== "object") {
    errors.push(`${label} must be an object`);
    return;
  }

  requireTranscriptRightsStatus(transcript.rights.status, `${label}.status`, errors);
  requireString(transcript.rights.notes, `${label}.notes`, errors);
  if (transcript.rights.status === "unknown") {
    warnings.push(`${transcript.slug} has unknown transcript rights`);
  }
  // Only apply the semantic raw-storage rule when both rights objects are
  // well-formed. A source whose `rights` is missing/non-object already produced
  // a "must be an object" schema error above (via validateSourceRights); calling
  // canStoreRawTranscript on it would dereference `source.rights.storeRawTranscript`
  // and crash the whole run with an uncaught TypeError. Skipping here keeps the
  // schema diagnostics actionable and avoids double-reporting the same problem.
  if (
    source &&
    transcriptExists &&
    isPlainObject(source.rights) &&
    isPlainObject(transcript.rights) &&
    !canStoreRawTranscript(source, transcript)
  ) {
    errors.push(
      `${transcript.slug} stores raw transcript text, but ${source.slug}.rights.storeRawTranscript is false or transcript rights are unknown`,
    );
  }
}

export function canStoreRawTranscript(
  source: Pick<SourceManifest, "rights">,
  transcript: Pick<TranscriptResource, "rights">,
): boolean {
  return source.rights.storeRawTranscript && transcript.rights.status !== "unknown";
}

export async function validateLibrary(root: string = packageRoot): Promise<ValidationResult> {
  const rootSourcesDir = resolve(root, "sources");
  const rootTranscriptsDir = resolve(root, "transcripts");
  const rootDerivativesDir = resolve(root, "derivatives");
  const toRelative = (path: string): string => (path.startsWith(root) ? path.slice(root.length + 1) : path);

  const errors: string[] = [];
  const warnings: string[] = [];
  const sources = await loadSources(rootSourcesDir);
  const sourceSlugs = new Set<string>();
  const sourcesBySlug = new Map<string, SourceManifest>();

  for (const source of sources) {
    requireString(source.slug, "source.slug", errors);
    requireString(source.title, `${source.slug}.title`, errors);
    requireString(source.url, `${source.slug}.url`, errors);
    requireStringArray(source.topics, `${source.slug}.topics`, errors);
    validateSourceRights(source, errors);
    if (sourceSlugs.has(source.slug)) errors.push(`duplicate source slug: ${source.slug}`);
    sourceSlugs.add(source.slug);
    sourcesBySlug.set(source.slug, source);
    if (source.kind === "youtube-channel" && !source.channelId) {
      warnings.push(`${source.slug} is a YouTube channel without channelId`);
    }
  }

  const transcripts = await loadTranscripts(rootTranscriptsDir);
  for (const transcript of transcripts) {
    requireString(transcript.slug, "transcript.slug", errors);
    requireString(transcript.sourceSlug, `${transcript.slug}.sourceSlug`, errors);
    requireString(transcript.title, `${transcript.slug}.title`, errors);
    requireString(transcript.url, `${transcript.slug}.url`, errors);
    requireString(transcript.transcriptPath, `${transcript.slug}.transcriptPath`, errors);
    if (!sourceSlugs.has(transcript.sourceSlug)) {
      errors.push(`${transcript.slug} references unknown source ${transcript.sourceSlug}`);
    }
    const transcriptPath = resolve(root, transcript.transcriptPath);
    const transcriptExists = await exists(transcriptPath);
    if (!transcriptExists) {
      errors.push(`${transcript.slug} transcriptPath does not exist: ${transcript.transcriptPath}`);
    }
    validateTranscriptRights(transcript, sourcesBySlug.get(transcript.sourceSlug), transcriptExists, errors, warnings);
  }

  const derivatives = await loadDerivatives(rootDerivativesDir);
  const transcriptPaths = new Set(
    transcripts.map((transcript) => toRelative(resolve(root, transcript.transcriptPath))),
  );
  const transcriptSidecars = new Set(
    transcripts.map((transcript) =>
      toRelative(resolve(rootTranscriptsDir, transcript.sourceSlug, `${transcript.slug}.resource.json`)),
    ),
  );

  for (const derivative of derivatives) {
    requireString(derivative.slug, "derivative.slug", errors);
    requireString(derivative.title, `${derivative.slug}.title`, errors);
    requireString(derivative.outputPath, `${derivative.slug}.outputPath`, errors);
    requireStringArray(derivative.sourceTranscripts, `${derivative.slug}.sourceTranscripts`, errors);
    for (const sourceTranscript of derivative.sourceTranscripts) {
      if (!transcriptPaths.has(sourceTranscript) && !transcriptSidecars.has(sourceTranscript)) {
        warnings.push(`${derivative.slug} references a transcript not indexed yet: ${sourceTranscript}`);
      }
    }
    if (!(await exists(resolve(root, derivative.outputPath)))) {
      errors.push(`${derivative.slug} outputPath does not exist: ${derivative.outputPath}`);
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
