import { resolve } from "node:path";

import { assetsRootForRepo, draftsManifestPath, promoteDrafts, readDraftManifest } from "../drafts.ts";
import { flag, has } from "./args.ts";
import { defaultRepo } from "./paths.ts";
import { projectAssetsDir, selectedProject } from "./registry.ts";

/**
 * `assetgen promote` — publish staged drafts (issue #54).
 *
 * Counterpart to `generate --draft`: moves a staged draft's files into the
 * assets root, registers it in `assets.json`, and prunes it from `drafts.json`.
 */
export async function runPromoteCommand(argv: string[]): Promise<void> {
  const game = flag(argv, "game", "shared")!;
  const repoFlag = flag(argv, "repo");
  const repo = repoFlag || defaultRepo(game);
  const assetsDir = flag(argv, "assets-dir");
  const all = has(argv, "all");
  const ids = collectIds(argv);

  if (!all && ids.length === 0) {
    printPromoteUsage();
    process.exit(1);
  }

  const project = !repoFlag && !assetsDir ? selectedProject() : undefined;
  const assetsRoot = resolve(assetsDir ?? (project ? projectAssetsDir(project) : assetsRootForRepo(repo)));

  try {
    const result = await promoteDrafts({ assetsRoot, all, ids, log: (line) => console.log(line) });
    if (result.promoted.length === 0) {
      const { assets } = await readDraftManifest(draftsManifestPath(assetsRoot));
      console.log(
        assets.length === 0
          ? `[promote] no staged drafts in ${draftsManifestPath(assetsRoot)}`
          : `[promote] nothing matched; staged drafts: ${assets.map((a) => a.id).join(", ")}`,
      );
      return;
    }
    console.log(
      `[promote] published ${result.promoted.length} asset(s): ` +
        result.promoted.map((e) => `${e.id}:${e.kind}`).join(", "),
    );
  } catch (err) {
    console.error(`[promote] ${String((err as Error)?.message ?? err)}`);
    process.exit(1);
  }
}

/** Collect every `--id` occurrence, splitting comma lists (`--id a,b`). Exported for testing. */
export function collectIds(argv: string[]): string[] {
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--id" && argv[i + 1] !== undefined) {
      for (const part of argv[i + 1]!.split(",")) {
        const id = part.trim();
        if (id.length > 0) ids.push(id);
      }
    }
  }
  return ids;
}

function printPromoteUsage(): void {
  console.error(
    "usage:\n" +
      "  assetgen promote (--id <id>[,<id>] | --all) [--game <slug>|shared] [--repo <game-repo-path>]\n" +
      "           [--assets-dir <project/packages/assets>]\n" +
      "\n" +
      "  Publishes drafts staged by `assetgen generate --draft`: moves their files\n" +
      "  into src/assets, registers them in assets.json, and prunes drafts.json.\n" +
      "  --id may be repeated; --all promotes every staged draft.",
  );
}
