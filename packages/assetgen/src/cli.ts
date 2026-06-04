#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPrompt, GAME_VIEW } from "./style.ts";
import { providers } from "./providers.ts";
import { toWebp } from "./postprocess.ts";
import { register } from "./manifest.ts";
import { runMatrix } from "./matrix.ts";
import { runTokens } from "./tokens.ts";
import type { GameSlug } from "../../assets/src/index.ts";

const argv = process.argv.slice(2);
// Verb dispatcher: argv[0] is a subcommand if known; otherwise single-asset mode.
const SUBCOMMANDS = new Set(["matrix", "tokens"]);
const sub = SUBCOMMANDS.has(argv[0]) ? argv[0] : undefined;
const rest = sub ? argv.slice(1) : argv;

const flag = (name: string, def?: string): string | undefined => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : def;
};
const has = (name: string) => rest.includes(`--${name}`);
// Parse a positive-integer flag, falling back to `def` on missing/NaN/<=0.
const intFlag = (name: string, def: number): number => {
  const raw = flag(name);
  const n = raw === undefined ? def : parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
};

const here = dirname(fileURLToPath(import.meta.url)); // packages/assetgen/src

// ─────────────────────────────────────────────────────────────────────────────
// `assetgen matrix` — generate the per-game variant matrix from the canon roster.
// ─────────────────────────────────────────────────────────────────────────────
if (sub === "matrix") {
  const assetsDir = flag("assets-dir") || join(here, "..", "..", "assets");
  if (!existsSync(join(assetsDir, "assets-catalog.json"))) {
    console.error(`[matrix] no assets-catalog.json under ${assetsDir} — pass --assets-dir <@shipshitgames/assets path>`);
    process.exit(1);
  }
  const res = await runMatrix({
    assetsDir,
    provider: flag("provider", "mock")!, // mock by default: safe to batch the whole matrix with no keys
    model: flag("model", "gpt-image-2"),
    size: intFlag("size", 1024),
    game: flag("game") as GameSlug | undefined,
    id: flag("id"),
    onlyMissing: has("only-missing"),
    dryRun: has("dry-run"),
    syncGames: has("sync-games"),
    gamesRoot: flag("games-root") || defaultGamesRoot(),
    log: (m) => console.log(m),
  });
  console.log(`[matrix] done: ${res.generated} generated, ${res.skipped} skipped of ${res.jobs} cell(s)`);
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// `assetgen tokens` — compile lore/DESIGN.md → style.generated.ts + token artifacts.
// `--check` exits 1 on drift (CI gate); `--design <path>` overrides the source.
// ─────────────────────────────────────────────────────────────────────────────
if (sub === "tokens") {
  const res = await runTokens({
    check: has("check"),
    design: flag("design"),
    log: (m) => console.log(m),
  });
  if (res.drift) {
    console.error("[tokens] drift detected — commit the regenerated artifacts.");
    process.exit(1);
  }
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-asset generation (default).
// ─────────────────────────────────────────────────────────────────────────────
const id = flag("id");
const prompt = flag("prompt");
const game = flag("game", "shared")!;
const kind = flag("kind", "sprite")!;
const provider = flag("provider", "openai")!;
const model = flag("model", "gpt-image-2")!;
const size = intFlag("size", 1024);
const repo = flag("repo") || defaultRepo(game);
const dryRun = has("dry-run");

function defaultGamesRoot(): string {
  const cwd = process.cwd();
  for (const c of [join(cwd, "games"), join(cwd, "..", "games")]) {
    if (existsSync(c)) return c;
  }
  return join(cwd, "games");
}

function defaultRepo(game: string): string {
  if (game === "shared") return process.cwd();
  const cwd = process.cwd();
  if (basename(cwd) === game) return cwd;

  const workspaceGamesPath = join(cwd, "games", game);
  if (existsSync(workspaceGamesPath)) return workspaceGamesPath;

  const siblingGamesPath = join(cwd, "..", "games", game);
  if (existsSync(siblingGamesPath)) return siblingGamesPath;

  return cwd;
}

if (!id || !prompt) {
  const views = Object.entries(GAME_VIEW)
    .map(([slug, v]) => `${slug} (${v})`)
    .join(", ");
  console.error(
    "usage:\n" +
      "  assetgen --id <id> --prompt <text> [--game <slug>|shared]\n" +
      "           [--kind sprite|texture|icon] [--provider openai|fal|codex|mock] [--model gpt-image-2]\n" +
      "           [--size 1024] [--repo <game-repo-path>] [--dry-run]\n" +
      "  assetgen matrix [--game <slug>] [--id <entity>] [--provider mock|openai|fal|codex]\n" +
      "           [--size 1024] [--only-missing] [--dry-run] [--sync-games] [--assets-dir <path>]\n" +
      `\n  games: ${views}\n` +
      "  Default game repo lookup prefers ./games/<game> or ../games/<game>.",
  );
  process.exit(1);
}

const full = buildPrompt({ prompt, game, kind });
const which = dryRun ? "mock" : provider;
const gen = providers[which];
if (!gen) {
  console.error(`unknown provider: ${provider}`);
  process.exit(1);
}

console.log(`[assetgen] provider=${which}${which === "openai" ? ` model=${model}` : ""} game=${game} kind=${kind} id=${id}`);
console.log(`[prompt] ${full}`);

const raw = await gen(full, { size: `${size}x${size}`, model });
const webp = await toWebp(raw, { size });

const subdir = kind === "sprite" ? "sprites" : kind === "texture" ? "textures" : kind;
const rel = `${subdir}/${id}.webp`;
const outPath = join(repo, "src/assets", rel);
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, webp);
console.log(`[wrote] ${outPath} (${(webp.length / 1024).toFixed(1)} kb)`);

await register(join(repo, "src/assets/assets.json"), {
  id,
  kind,
  game,
  path: rel,
  prompt,
  provider: which,
});
console.log(`[manifest] ${join(repo, "src/assets/assets.json")} updated`);
