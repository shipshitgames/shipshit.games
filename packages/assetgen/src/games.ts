import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

export const GAME_SLUGS = [
  "scourge-survivors",
  "deadlane",
  "pactfall",
  "starblight",
  "redline",
  "rothulk",
] as const;

export type GameSlug = (typeof GAME_SLUGS)[number];

export interface GameTokenTarget {
  slug: GameSlug;
  /** Path relative to `gamesRoot/<slug>`. */
  constantsPath: string;
  /** Path relative to `gamesRoot/<slug>`. */
  stylesPath: string;
  /** Path relative to `gamesRoot/<slug>`. May not exist yet. */
  fontTarget: string;
}

export interface GamesManifest {
  version: 1;
  generatedBy: "@shipshitgames/assetgen games";
  /** Path from the assets package to the Deadrot games root. */
  gamesRoot: string;
  games: GameTokenTarget[];
}

export interface GamesResult {
  drift: boolean;
  file: string;
  games: GameTokenTarget[];
}

const CONSTANTS_CANDIDATES = ["src/game/constants.ts", "src/constants.ts"] as const;
const STYLES_CANDIDATES = ["src/styles.css", "src/app.css", "src/index.css", "src/globals.css"] as const;

function portable(path: string): string {
  return path.split(sep).join("/");
}

function findExistingRelative(root: string, candidates: readonly string[], label: string): string {
  const found = candidates.find((candidate) => existsSync(join(root, candidate)));
  if (!found) {
    throw new Error(`${label} not found under ${root} (tried: ${candidates.join(", ")})`);
  }
  return found;
}

export function discoverGameTargets(
  gamesRoot: string,
  slugs: readonly GameSlug[] = GAME_SLUGS,
): GameTokenTarget[] {
  if (!existsSync(gamesRoot)) {
    throw new Error(`games root not found: ${gamesRoot}`);
  }

  return slugs.map((slug) => {
    const gameRoot = join(gamesRoot, slug);
    if (!existsSync(gameRoot)) {
      throw new Error(`game not found under games root: ${slug} (${gameRoot})`);
    }

    const constantsPath = findExistingRelative(gameRoot, CONSTANTS_CANDIDATES, `${slug} constants.ts`);
    const stylesPath = findExistingRelative(gameRoot, STYLES_CANDIDATES, `${slug} styles.css`);
    const fontTarget = portable(join(dirname(stylesPath), "fonts.css"));

    return {
      slug,
      constantsPath,
      stylesPath,
      fontTarget,
    };
  });
}

export function gamesManifestPath(assetsDir: string): string {
  return join(assetsDir, "games.json");
}

export function buildGamesManifest(assetsDir: string, gamesRoot: string, games: GameTokenTarget[]): GamesManifest {
  return {
    version: 1,
    generatedBy: "@shipshitgames/assetgen games",
    gamesRoot: portable(relative(assetsDir, gamesRoot) || "."),
    games,
  };
}

export async function runGamesDiscovery(
  opts: {
    assetsDir: string;
    gamesRoot: string;
    check?: boolean;
    log?: (msg: string) => void;
  },
): Promise<GamesResult> {
  const log = opts.log ?? (() => {});
  const games = discoverGameTargets(opts.gamesRoot);
  const file = gamesManifestPath(opts.assetsDir);
  const content = JSON.stringify(buildGamesManifest(opts.assetsDir, opts.gamesRoot, games), null, 2) + "\n";
  const current = existsSync(file) ? await readFile(file, "utf8") : "";
  const drift = current !== content;
  const rel = portable(relative(process.cwd(), file));

  if (opts.check) {
    log(drift ? `[games] DRIFT ${rel}` : `[games] ok   ${rel}`);
    return { drift, file, games };
  }

  if (drift) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
    log(`[games] wrote ${rel}`);
  } else {
    log(`[games] ok   ${rel}`);
  }

  return { drift: false, file, games };
}
