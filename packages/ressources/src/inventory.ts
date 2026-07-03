/**
 * Inventory commands: make the source/transcript/derivative library inspectable
 * by humans (aligned tables) and tools (stable JSON) without reading any
 * markdown. Each inventory loads the relevant `*.json` / `*.resource.json`
 * manifests resiliently — a single malformed file is reported as an error and
 * skipped instead of aborting the whole listing — and shape-checks every parsed
 * record against the same published JSON Schemas `validate` uses. Records that
 * fail to parse or violate their schema are surfaced in `errors`, which the CLI
 * turns into a non-zero exit. File-existence and cross-file referential rules
 * stay the job of `validate`; inventory only inspects what is on disk.
 */
import { access, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import {
  derivativesDir as defaultDerivativesDir,
  packageRoot,
  schemasDir as defaultSchemasDir,
  sourcesDir as defaultSourcesDir,
  transcriptsDir as defaultTranscriptsDir,
} from "./paths";
import { validateValue, type JsonSchema } from "./schema";

export type InventoryKind = "sources" | "transcripts" | "derivatives";

export interface InventoryOptions {
  /** Directory scanned for `source.json` manifests. Defaults to the package `sources/`. */
  sourcesDir?: string;
  /** Directory scanned for transcript `*.resource.json` sidecars. Defaults to the package `transcripts/`. */
  transcriptsDir?: string;
  /** Directory scanned for derivative `*.resource.json` manifests. Defaults to the package `derivatives/`. */
  derivativesDir?: string;
  /** Directory holding the canonical JSON Schemas. Defaults to the package `schemas/`. */
  schemasDir?: string;
  /** Base directory reported manifest paths are relative to. Defaults to the package root. */
  contentRoot?: string;
}

export interface SourceInventoryItem {
  slug: string;
  title: string;
  kind: string;
  priority: string;
  status: string;
  url: string;
  topics: string[];
  desiredOutputs: string[];
  /** `rights.transcriptPolicy` — the expected provenance for transcript text. */
  transcriptPolicy: string;
  /** `rights.storeRawTranscript` — whether raw transcript files may live here. */
  storeRawTranscript: boolean;
  /** Transcript sidecars whose `sourceSlug` points back at this source. */
  transcriptCount: number;
  /** Manifest path relative to `contentRoot`, with `/` separators. */
  path: string;
}

export interface TranscriptInventoryItem {
  slug: string;
  sourceSlug: string;
  title: string;
  sourceKind: string;
  url: string;
  capturedAt: string;
  transcriptFormat: string;
  transcriptPath: string;
  /** `rights.status` — the recorded provenance of the transcript text. */
  rightsStatus: string;
  tags: string[];
  /** skill + app + tool candidates declared on this transcript. */
  derivativeCount: number;
  path: string;
}

export interface DerivativeInventoryItem {
  slug: string;
  kind: string;
  title: string;
  status: string;
  summary: string;
  sourceTranscripts: string[];
  sourceTranscriptCount: number;
  outputPath: string;
  tags: string[];
  path: string;
}

export interface Inventory<Item> {
  schemaVersion: 1;
  kind: InventoryKind;
  count: number;
  items: Item[];
  /** Validation-blocking problems (unparseable or schema-invalid records). */
  errors: string[];
  /** Non-blocking advisories. */
  warnings: string[];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Recursively collect files under `root` whose basename satisfies `predicate`, sorted for stable output. */
async function listFiles(root: string, predicate: (name: string) => boolean): Promise<string[]> {
  if (!(await pathExists(root))) return [];
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && predicate(entry.name)) out.push(full);
    }
  }
  await walk(root);
  return out.sort();
}

function toRelative(file: string, contentRoot: string): string {
  return relative(contentRoot, file).split("\\").join("/");
}

interface ParsedRecord {
  path: string;
  value: unknown;
}

interface LoadedRecords {
  records: ParsedRecord[];
  errors: string[];
}

/** Read + JSON-parse each manifest, collecting per-file errors rather than throwing. */
async function loadRecords(files: string[], contentRoot: string): Promise<LoadedRecords> {
  const records: ParsedRecord[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const path = toRelative(file, contentRoot);
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      errors.push(`${path}: could not read file (${(error as Error).message})`);
      continue;
    }
    try {
      records.push({ path, value: JSON.parse(text) as unknown });
    } catch (error) {
      errors.push(`${path}: invalid JSON (${(error as Error).message})`);
    }
  }
  return { records, errors };
}

async function loadSchema(dir: string, name: string): Promise<JsonSchema> {
  return JSON.parse(await readFile(join(dir, name), "utf8")) as JsonSchema;
}

/** A non-null, non-array object — the only shape whose fields may be projected. */
function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isTrue(value: unknown): boolean {
  return value === true;
}

function byPath<Item extends { path: string }>(a: Item, b: Item): number {
  return a.path.localeCompare(b.path);
}

/** Count transcript sidecars per `sourceSlug`, tolerating malformed files (the transcripts command reports those). */
async function countTranscriptsBySource(transcriptsDir: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const files = await listFiles(transcriptsDir, (name) => name.endsWith(".resource.json"));
  for (const file of files) {
    try {
      const obj = asObject(JSON.parse(await readFile(file, "utf8")) as unknown);
      const sourceSlug = obj ? str(obj.sourceSlug) : "";
      if (sourceSlug) counts.set(sourceSlug, (counts.get(sourceSlug) ?? 0) + 1);
    } catch {
      // A malformed transcript surfaces as an error in `inventoryTranscripts`; it
      // must not break the source-count rollup the `sources` command renders.
    }
  }
  return counts;
}

export async function inventorySources(options: InventoryOptions = {}): Promise<Inventory<SourceInventoryItem>> {
  const sourcesDir = options.sourcesDir ?? defaultSourcesDir;
  const transcriptsDir = options.transcriptsDir ?? defaultTranscriptsDir;
  const schemasDir = options.schemasDir ?? defaultSchemasDir;
  const contentRoot = options.contentRoot ?? packageRoot;

  const schema = await loadSchema(schemasDir, "source.schema.json");
  const files = await listFiles(sourcesDir, (name) => name === "source.json");
  const { records, errors } = await loadRecords(files, contentRoot);
  const transcriptCounts = await countTranscriptsBySource(transcriptsDir);

  const items: SourceInventoryItem[] = [];
  for (const { path, value } of records) {
    errors.push(...validateValue(value, schema, path));
    const object = asObject(value);
    if (!object) continue; // schema pass already recorded the wrong shape
    const rights = asObject(object.rights);
    const slug = str(object.slug);
    items.push({
      slug,
      title: str(object.title),
      kind: str(object.kind),
      priority: str(object.priority),
      status: str(object.status),
      url: str(object.url),
      topics: strArray(object.topics),
      desiredOutputs: strArray(object.desiredOutputs),
      transcriptPolicy: rights ? str(rights.transcriptPolicy) : "",
      storeRawTranscript: rights ? isTrue(rights.storeRawTranscript) : false,
      transcriptCount: slug ? (transcriptCounts.get(slug) ?? 0) : 0,
      path,
    });
  }
  items.sort(byPath);
  return { schemaVersion: 1, kind: "sources", count: items.length, items, errors, warnings: [] };
}

export async function inventoryTranscripts(
  options: InventoryOptions = {},
): Promise<Inventory<TranscriptInventoryItem>> {
  const transcriptsDir = options.transcriptsDir ?? defaultTranscriptsDir;
  const schemasDir = options.schemasDir ?? defaultSchemasDir;
  const contentRoot = options.contentRoot ?? packageRoot;

  const schema = await loadSchema(schemasDir, "transcript-resource.schema.json");
  const files = await listFiles(transcriptsDir, (name) => name.endsWith(".resource.json"));
  const { records, errors } = await loadRecords(files, contentRoot);

  const items: TranscriptInventoryItem[] = [];
  for (const { path, value } of records) {
    errors.push(...validateValue(value, schema, path));
    const object = asObject(value);
    if (!object) continue;
    const rights = asObject(object.rights);
    const derivatives = asObject(object.derivatives);
    const derivativeCount = derivatives
      ? strArray(derivatives.skillCandidates).length +
        strArray(derivatives.appCandidates).length +
        strArray(derivatives.toolCandidates).length
      : 0;
    items.push({
      slug: str(object.slug),
      sourceSlug: str(object.sourceSlug),
      title: str(object.title),
      sourceKind: str(object.sourceKind),
      url: str(object.url),
      capturedAt: str(object.capturedAt),
      transcriptFormat: str(object.transcriptFormat),
      transcriptPath: str(object.transcriptPath),
      rightsStatus: rights ? str(rights.status) : "",
      tags: strArray(object.tags),
      derivativeCount,
      path,
    });
  }
  items.sort(byPath);
  return { schemaVersion: 1, kind: "transcripts", count: items.length, items, errors, warnings: [] };
}

export async function inventoryDerivatives(
  options: InventoryOptions = {},
): Promise<Inventory<DerivativeInventoryItem>> {
  const derivativesDir = options.derivativesDir ?? defaultDerivativesDir;
  const schemasDir = options.schemasDir ?? defaultSchemasDir;
  const contentRoot = options.contentRoot ?? packageRoot;

  const schema = await loadSchema(schemasDir, "derivative.schema.json");
  const files = await listFiles(derivativesDir, (name) => name.endsWith(".resource.json"));
  const { records, errors } = await loadRecords(files, contentRoot);

  const items: DerivativeInventoryItem[] = [];
  for (const { path, value } of records) {
    errors.push(...validateValue(value, schema, path));
    const object = asObject(value);
    if (!object) continue;
    const sourceTranscripts = strArray(object.sourceTranscripts);
    items.push({
      slug: str(object.slug),
      kind: str(object.kind),
      title: str(object.title),
      status: str(object.status),
      summary: str(object.summary),
      sourceTranscripts,
      sourceTranscriptCount: sourceTranscripts.length,
      outputPath: str(object.outputPath),
      tags: strArray(object.tags),
      path,
    });
  }
  items.sort(byPath);
  return { schemaVersion: 1, kind: "derivatives", count: items.length, items, errors, warnings: [] };
}

/** Render a left-aligned fixed-width table; columns size to their widest cell. */
function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => (row[column] ?? "").length)),
  );
  const line = (cells: string[]): string =>
    cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ").trimEnd();
  const divider = widths.map((width) => "-".repeat(width)).join("  ");
  return [line(headers), divider, ...rows.map(line)].join("\n");
}

export function formatSourcesTable(inventory: Inventory<SourceInventoryItem>): string {
  if (inventory.items.length === 0) return "(no sources)";
  return formatTable(
    ["SLUG", "KIND", "PRIORITY", "STATUS", "TRANSCRIPTS", "TITLE"],
    inventory.items.map((item) => [
      item.slug,
      item.kind,
      item.priority,
      item.status,
      String(item.transcriptCount),
      item.title,
    ]),
  );
}

export function formatTranscriptsTable(inventory: Inventory<TranscriptInventoryItem>): string {
  if (inventory.items.length === 0) return "(no transcripts)";
  return formatTable(
    ["SLUG", "SOURCE", "RIGHTS", "DERIVATIVES", "TITLE"],
    inventory.items.map((item) => [
      item.slug,
      item.sourceSlug,
      item.rightsStatus,
      String(item.derivativeCount),
      item.title,
    ]),
  );
}

export function formatDerivativesTable(inventory: Inventory<DerivativeInventoryItem>): string {
  if (inventory.items.length === 0) return "(no derivatives)";
  return formatTable(
    ["SLUG", "KIND", "STATUS", "SOURCES", "TITLE"],
    inventory.items.map((item) => [
      item.slug,
      item.kind,
      item.status,
      String(item.sourceTranscriptCount),
      item.title,
    ]),
  );
}
