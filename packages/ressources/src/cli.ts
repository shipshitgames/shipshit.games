#!/usr/bin/env bun
import {
  createDerivative,
  createTranscriptResource,
  loadSources,
  syncChannelVideos,
  validateLibrary,
} from "./library";
import type { DerivativeKind, TranscriptRightsStatus } from "./types";

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

function help(): void {
  console.log(`usage: ressources <command> [flags]

commands:
  sources           list source manifests
  validate          validate sources, transcripts, and derivatives
  new-transcript    create transcript markdown plus sidecar metadata
  new-derivative    create a skill/app/tool/rule candidate
  sync-channel      sync YouTube channel video metadata with yt-dlp

examples:
  bun packages/ressources/src/cli.ts sources
  bun packages/ressources/src/cli.ts validate
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

    case "sources": {
      const sources = await loadSources();
      for (const source of sources) {
        console.log(`${source.slug}\t${source.priority}\t${source.kind}\t${source.title}\t${source.url}`);
      }
      return;
    }

    case "validate": {
      const result = await validateLibrary();
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
      help();
      throw new Error(`unknown command: ${command}`);
  }
}

run().catch((error) => {
  console.error(`[ressources] ${(error as Error).message}`);
  process.exit(1);
});
