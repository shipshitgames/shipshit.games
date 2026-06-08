/**
 * The per-game sprite variant matrix (issue #6).
 *
 * One canon roster (`@shipshitgames/assets/assets-catalog.json`) drives generation of
 * every entity's per-game render. For each entity we expand `(entity × intended
 * game)` jobs, build a per-game prompt (the entity's `promptBase` + the game's
 * framing + the DOOM style suffix), generate, post-process to `.webp`, write the
 * render INTO the assets package at `entities/<id>/<game>.webp`, and record the
 * path back into the catalog's `variants` map. Swap `--provider mock` for a real
 * provider to fill the identical paths with real art.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildPrompt } from "./style.ts";
import { generateAsset } from "./providers.ts";
import { toWebp } from "./postprocess.ts";
import { register } from "./manifest.ts";
import { appendUsageLog } from "./usage.ts";
import { licenseForGeneration } from "./pipeline.ts";

const CATALOG_FILE = "assets-catalog.json";

export type GameSlug =
  | "scourge-survivors"
  | "deadlane"
  | "pactfall"
  | "starblight"
  | "redline"
  | "rothulk";

type Faction = "scourge" | "pyre" | "wardens" | "neutral";
type HostFamily =
  | "rot-flesh"
  | "chitin"
  | "mycelial"
  | "machine-graft"
  | "bone-titan"
  | "voidship";

type AssetVariants = Record<GameSlug, string | null>;

export interface EntityAsset {
  id: string;
  kind: "entity" | "boss";
  name: string;
  faction: Faction;
  hostFamily: HostFamily | null;
  canon: string;
  promptBase: string;
  games: GameSlug[];
  variants: AssetVariants;
}

export interface AssetCatalog {
  $schema?: string;
  version: string;
  note?: string;
  entities: EntityAsset[];
  shared: unknown[];
}

export interface MatrixOptions {
  /** Path to the `@shipshitgames/assets` package (holds the catalog + renders). */
  assetsDir: string;
  /** Provider key: "mock" | "openai" | "fal" | "codex". `dryRun` forces "mock". */
  provider: string;
  model?: string;
  size: number;
  /** Only render this game column. */
  game?: GameSlug;
  /** Only render this entity row. */
  id?: string;
  /** Skip cells already rendered (variant path set AND file present on disk). */
  onlyMissing: boolean;
  /** Force the mock provider regardless of `provider`. */
  dryRun: boolean;
  /** Also upsert each render into the matching game's src/assets/assets.json. */
  syncGames: boolean;
  /** Where `games/<slug>` live, for `syncGames`. */
  gamesRoot?: string;
  usageLogPath?: string | null;
  log?: (msg: string) => void;
}

export interface MatrixJob {
  entity: EntityAsset;
  game: GameSlug;
  /** Path relative to `assetsDir`, e.g. "entities/scourge-swarm/deadlane.webp". */
  outRel: string;
  /** Absolute path on disk. */
  outAbs: string;
}

export interface MatrixResult {
  jobs: number;
  generated: number;
  skipped: number;
}

export function catalogPath(assetsDir: string): string {
  return join(assetsDir, CATALOG_FILE);
}

export async function loadCatalog(assetsDir: string): Promise<AssetCatalog> {
  return JSON.parse(await readFile(catalogPath(assetsDir), "utf8")) as AssetCatalog;
}

/** The relative render path for one entity's per-game variant. */
export function variantRel(id: string, game: GameSlug): string {
  return `entities/${id}/${game}.webp`;
}

/** Expand the catalog into the full set of `(entity × intended game)` render jobs. */
export function expandJobs(
  catalog: AssetCatalog,
  assetsDir: string,
  filter: { game?: GameSlug; id?: string } = {},
): MatrixJob[] {
  const jobs: MatrixJob[] = [];
  for (const entity of catalog.entities) {
    if (filter.id && entity.id !== filter.id) continue;
    for (const game of entity.games) {
      if (filter.game && game !== filter.game) continue;
      const outRel = variantRel(entity.id, game);
      jobs.push({ entity, game, outRel, outAbs: join(assetsDir, outRel) });
    }
  }
  return jobs;
}

/**
 * Generate the variant matrix: render each intended `(entity, game)` cell,
 * write it into the assets package, and persist the catalog with updated
 * `variants`. Returns counts of generated / skipped cells.
 */
export async function runMatrix(opts: MatrixOptions): Promise<MatrixResult> {
  const log = opts.log ?? (() => {});
  const which = opts.dryRun ? "mock" : opts.provider;

  const catalog = await loadCatalog(opts.assetsDir);
  const jobs = expandJobs(catalog, opts.assetsDir, { game: opts.game, id: opts.id });
  log(`[matrix] ${jobs.length} cell(s) — provider=${which} size=${opts.size}`);

  let generated = 0;
  let skipped = 0;

  for (const job of jobs) {
    const current = job.entity.variants[job.game];
    if (opts.onlyMissing && current && existsSync(job.outAbs)) {
      skipped++;
      continue;
    }

    const full = buildPrompt({ prompt: job.entity.promptBase, game: job.game, kind: "sprite" });
    log(`[gen] ${job.entity.id} → ${job.game}`);
    const started = Date.now();
    let ok = false;
    let usedModel = opts.model;
    let usageError: unknown;
    try {
      const raw = await generateAsset("sprite", full, {
        provider: which,
        size: `${opts.size}x${opts.size}`,
        model: opts.model,
        log: (chunk) => log(chunk),
      });
      usedModel = raw.model;
      const webp = await toWebp(raw.data, { size: opts.size });
      await mkdir(dirname(job.outAbs), { recursive: true });
      await writeFile(job.outAbs, webp);
      job.entity.variants[job.game] = job.outRel; // record into the in-memory catalog
      generated++;

      if (opts.syncGames && opts.gamesRoot) {
        const manifest = join(opts.gamesRoot, job.game, "src/assets/assets.json");
        await register(manifest, {
          id: job.entity.id,
          kind: "sprite",
          game: job.game,
          path: `@shipshitgames/assets/${job.outRel}`,
          prompt: job.entity.promptBase,
          provider: raw.provider,
          license: licenseForGeneration({
            provider: raw.provider,
            model: raw.model,
            kind: "sprite",
            date: new Date(),
          }),
        });
      }
      ok = true;
    } catch (error) {
      usageError = error;
      throw error;
    } finally {
      try {
        await appendUsageLog(
          {
            command: "matrix",
            provider: which,
            kind: "sprite",
            game: job.game,
            id: job.entity.id,
            model: usedModel,
            size: opts.size,
            outputPath: job.outAbs,
            prompt: job.entity.promptBase,
            success: ok,
            durationMs: Date.now() - started,
            error: usageError,
          },
          opts.usageLogPath,
        );
      } catch (error) {
        log(`[usage] failed to write usage log: ${String((error as Error)?.message ?? error)}`);
      }
    }
  }

  // Persist the catalog with updated variant paths (preserves $schema/version/note/order).
  await writeFile(catalogPath(opts.assetsDir), JSON.stringify(catalog, null, 2) + "\n");
  log(`[matrix] generated=${generated} skipped=${skipped} — catalog updated`);

  return { jobs: jobs.length, generated, skipped };
}
