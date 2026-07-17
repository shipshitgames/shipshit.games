#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createDerivative,
  createTranscriptResource,
  loadSources,
  syncChannelVideos,
  validateLibrary,
} from "./library";
import {
  formatDerivativesTable,
  formatSourcesTable,
  formatTranscriptsTable,
  inventoryDerivatives,
  inventorySources,
  inventoryTranscripts,
  type Inventory,
  type InventoryOptions,
} from "./inventory";
import { distill } from "./distill";
import { distillSource, type DuplicatePolicy } from "./distill-flow";
import { packageRoot } from "./paths";
import { fetchTranscript } from "./transcript";
import type {
  DerivativeKind,
  SourceManifest,
  TranscriptRightsStatus,
} from "./types";

const argv = process.argv.slice(2);
const command = argv[0] ?? "help";

function flag(name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function allFlags(name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}`) {
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) out.push(value);
    }
  }
  return out;
}

function boolFlag(name: string): boolean {
  return argv.includes(`--${name}`);
}

/** Point an inventory command at another library tree with `--root <dir>`. */
function inventoryOptions(): InventoryOptions {
  const root = flag("root");
  if (!root) return {};
  return {
    sourcesDir: resolve(root, "sources"),
    transcriptsDir: resolve(root, "transcripts"),
    derivativesDir: resolve(root, "derivatives"),
    contentRoot: resolve(root),
  };
}

/**
 * Print an inventory (stable JSON with `--json`, otherwise an aligned table),
 * route any validation-blocking errors to stderr, and exit non-zero when the
 * library has malformed records.
 */
function emitInventory<Item>(inventory: Inventory<Item>, table: string): void {
  console.log(boolFlag("json") ? JSON.stringify(inventory, null, 2) : table);
  for (const warning of inventory.warnings) console.warn(`[warn] ${warning}`);
  for (const error of inventory.errors) console.error(`[error] ${error}`);
  if (inventory.errors.length > 0) process.exit(1);
}

async function runDistill(): Promise<void> {
  const sourceSlug = flag("source");
  const url = flag("url");
  const transcriptFile = flag("transcript-file");
  const root = resolve(flag("root") ?? packageRoot);
  const outTranscript = flag("out-transcript");
  const rightsFlag = flag("rights");
  const duplicateFlag = flag("duplicate");
  const providerFlag = flag("provider");
  const provider = providerFlag ?? "codex";
  let title = flag("title");

  if (argv.includes("--url") && !url) {
    throw new Error("--url requires a source URL");
  }
  if (argv.includes("--transcript-file") && !transcriptFile) {
    throw new Error("--transcript-file requires a path");
  }
  if (argv.includes("--source") && !sourceSlug) {
    throw new Error("--source requires a source manifest slug");
  }
  if (argv.includes("--out-transcript") && !outTranscript) {
    throw new Error("--out-transcript requires a destination path");
  }
  if (argv.includes("--rights") && !rightsFlag) {
    throw new Error("--rights requires a reviewed transcript rights status");
  }
  if (argv.includes("--duplicate") && !duplicateFlag) {
    throw new Error("--duplicate requires skip, overwrite, or versioned");
  }
  if (argv.includes("--slug") && !flag("slug")) {
    throw new Error("--slug requires a non-empty slug");
  }
  if (argv.includes("--title") && !title) {
    throw new Error("--title requires a non-empty title");
  }
  if (argv.includes("--provider") && !providerFlag) {
    throw new Error("--provider requires codex or mock");
  }
  if (!["codex", "mock"].includes(provider)) {
    throw new Error(`unknown provider: ${provider} (use codex | mock)`);
  }
  const rightsValues: TranscriptRightsStatus[] = [
    "user-provided",
    "public-captions",
    "official-api",
    "permissioned",
    "unknown",
  ];
  if (rightsFlag && !rightsValues.includes(rightsFlag as TranscriptRightsStatus)) {
    throw new Error(`unknown transcript rights status: ${rightsFlag}`);
  }
  const duplicateValues: DuplicatePolicy[] = ["skip", "overwrite", "versioned"];
  if (duplicateFlag && !duplicateValues.includes(duplicateFlag as DuplicatePolicy)) {
    throw new Error(`unknown duplicate policy: ${duplicateFlag}`);
  }
  if (sourceSlug && transcriptFile && !title) {
    throw new Error("source-aware distill with --transcript-file requires --title");
  }
  if (sourceSlug && transcriptFile && !url) {
    throw new Error("source-aware distill with --transcript-file requires --url");
  }
  if (sourceSlug && outTranscript && !rightsFlag) {
    throw new Error("source-aware distill requires explicit --rights with --out-transcript");
  }
  if (sourceSlug && flag("out")) {
    throw new Error(
      "source-aware distill writes canonical derivatives/rules output; use --slug instead of --out",
    );
  }
  if (!url && !transcriptFile) {
    throw new Error(
      "distill requires --url <youtube-url> or --transcript-file <path>; " +
        "source-aware flags: --source, --slug, --out-transcript, --rights, " +
        "--duplicate skip|overwrite|versioned, --provider codex|mock",
    );
  }
  if (!sourceSlug && (rightsFlag || duplicateFlag || flag("slug"))) {
    throw new Error("--rights, --duplicate, and --slug require source-aware distill with --source");
  }

  let resolvedSource: SourceManifest | undefined;
  if (sourceSlug) {
    const sources = await loadSources(resolve(root, "sources"));
    resolvedSource = sources.find((source) => source.slug === sourceSlug);
    if (!resolvedSource) {
      throw new Error(`unknown source: ${sourceSlug}`);
    }
  }

  const log = (message: string) => console.log(message);
  let transcript: string;
  if (transcriptFile) {
    log(`[transcript] reading ${transcriptFile}`);
    transcript = await readFile(resolve(transcriptFile), "utf8");
    title ??= transcriptFile;
  } else {
    const result = await fetchTranscript(url!, log);
    transcript = result.transcript;
    title ??= result.title;
  }

  if (sourceSlug) {
    if (!title?.trim()) {
      throw new Error("source-aware distill requires a non-empty transcript title");
    }
    const inferredRights: TranscriptRightsStatus = transcriptFile
      ? "user-provided"
      : "public-captions";
    const result = await distillSource({
      sourceSlug,
      transcript,
      title,
      url,
      slug: flag("slug"),
      provider,
      rightsStatus: (rightsFlag as TranscriptRightsStatus | undefined) ?? inferredRights,
      rightsExplicit: Boolean(rightsFlag),
      outTranscriptPath: outTranscript ? resolve(outTranscript) : undefined,
      duplicatePolicy: (duplicateFlag ?? "skip") as DuplicatePolicy,
      root,
      source: resolvedSource,
      log,
    });
    console.log(`[distill-${result.status}] ${result.rulesPath}`);
    return;
  }

  const out = resolve(flag("out") ?? "rules.generated.md");
  if (outTranscript) {
    const transcriptOut = resolve(outTranscript);
    await mkdir(dirname(transcriptOut), { recursive: true });
    await writeFile(transcriptOut, transcript, "utf8");
    log(`[transcript-wrote] ${transcriptOut} (${(transcript.length / 1024).toFixed(1)} kb)`);
  }

  log(`[distill] provider=${provider}`);
  const rules = await distill({ transcript, title: title ?? "Untitled", url: url ?? "", provider, log });
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, rules, "utf8");
  log(`[wrote] ${out} (${(rules.length / 1024).toFixed(1)} kb)`);
}

function help(): void {
  console.log(`usage: ressources <command> [flags]

commands:
  sources           inventory source manifests (--json for tools, --root <dir> for another library)
  transcripts       inventory transcript sidecars (--json, --root <dir>)
  derivatives       inventory derivative manifests (--json, --root <dir>)
  validate          validate sources, transcripts, and derivatives against schemas/ (--root <dir> for another library)
  distill           fetch/read a transcript and distill reusable build rules
  new-transcript    create transcript markdown plus sidecar metadata
  new-derivative    create a skill/app/tool/rule candidate
  sync-channel      sync YouTube channel video metadata with yt-dlp

examples:
  bun packages/ressources/src/cli.ts sources
  bun packages/ressources/src/cli.ts sources --json
  bun packages/ressources/src/cli.ts transcripts --json
  bun packages/ressources/src/cli.ts derivatives
  bun packages/ressources/src/cli.ts validate
  bun packages/ressources/src/cli.ts distill --source <slug> --url <youtube-url> --duplicate skip
  bun packages/ressources/src/cli.ts distill --source <slug> --transcript-file transcript.txt --title "Title" --url <source-url> --rights user-provided --out-transcript packages/ressources/transcripts/<slug>/title.transcript.md
  bun packages/ressources/src/cli.ts new-transcript --source ai-oriented-dev --url <youtube-url> --title "Title"
  bun packages/ressources/src/cli.ts new-derivative --kind skill --slug my-skill --title "My Skill" --source-transcript transcripts/source/video.resource.json
  bun packages/ressources/src/cli.ts sync-channel --source ai-oriented-dev --limit 50`);
}

async function run(): Promise<void> {
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      help();
      return;

    case "distill":
    case "rules": {
      await runDistill();
      return;
    }

    case "sources": {
      const inventory = await inventorySources(inventoryOptions());
      emitInventory(inventory, formatSourcesTable(inventory));
      return;
    }

    case "transcripts": {
      const inventory = await inventoryTranscripts(inventoryOptions());
      emitInventory(inventory, formatTranscriptsTable(inventory));
      return;
    }

    case "derivatives": {
      const inventory = await inventoryDerivatives(inventoryOptions());
      emitInventory(inventory, formatDerivativesTable(inventory));
      return;
    }

    case "validate": {
      const root = flag("root");
      const options = root
        ? {
            sourcesDir: resolve(root, "sources"),
            transcriptsDir: resolve(root, "transcripts"),
            derivativesDir: resolve(root, "derivatives"),
            contentRoot: resolve(root),
          }
        : {};
      const result = await validateLibrary(options);
      for (const warning of result.warnings) console.warn(`[warn] ${warning}`);
      for (const error of result.errors) console.error(`[error] ${error}`);
      console.log(
        `[validate] sources=${result.counts.sources} transcripts=${result.counts.transcripts} derivatives=${result.counts.derivatives}`,
      );
      if (!result.ok) process.exit(1);
      return;
    }

    case "new-transcript": {
      const sourceSlug = flag("source");
      const url = flag("url") ?? flag("video-url");
      const title = flag("title");
      if (!sourceSlug || !url || !title) {
        throw new Error("new-transcript requires --source, --url, and --title");
      }
      const resource = await createTranscriptResource({
        sourceSlug,
        url,
        title,
        slug: flag("slug"),
        rightsStatus: flag("rights") as TranscriptRightsStatus | undefined,
        force: boolFlag("force"),
      });
      console.log(`[transcript] ${resource.transcriptPath}`);
      return;
    }

    case "new-derivative": {
      const kind = flag("kind") as DerivativeKind | undefined;
      const slug = flag("slug");
      const title = flag("title");
      const sourceTranscripts = allFlags("source-transcript");
      if (!kind || !["rule", "skill", "app", "tool"].includes(kind)) {
        throw new Error("new-derivative requires --kind rule|skill|app|tool");
      }
      if (!slug || !title || sourceTranscripts.length === 0) {
        throw new Error("new-derivative requires --slug, --title, and at least one --source-transcript");
      }
      const derivative = await createDerivative({
        kind,
        slug,
        title,
        sourceTranscripts,
        summary: flag("summary"),
        force: boolFlag("force"),
      });
      console.log(`[derivative] ${derivative.outputPath}`);
      return;
    }

    case "sync-channel": {
      const sourceSlug = flag("source");
      if (!sourceSlug) throw new Error("sync-channel requires --source");
      const limit = Number(flag("limit") ?? "50");
      const synced = await syncChannelVideos(sourceSlug, limit);
      console.log(`[sync] ${synced.sourceSlug} videos=${synced.videos.length}`);
      return;
    }

    default:
      if (command.startsWith("--")) {
        await runDistill();
        return;
      }
      help();
      throw new Error(`unknown command: ${command}`);
  }
}

run().catch((error) => {
  console.error(`[ressources] ${(error as Error).message}`);
  process.exit(1);
});
