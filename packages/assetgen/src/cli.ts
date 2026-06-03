#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { buildPrompt } from "./style.ts";
import { providers } from "./providers.ts";
import { toWebp } from "./postprocess.ts";
import { register } from "./manifest.ts";

const argv = process.argv.slice(2);
const flag = (name: string, def?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const has = (name: string) => argv.includes(`--${name}`);

const id = flag("id");
const prompt = flag("prompt");
const game = flag("game", "shared")!;
const kind = flag("kind", "sprite")!;
const provider = flag("provider", "openai")!;
const model = flag("model", "gpt-image-2")!;
const size = parseInt(flag("size", "1024")!, 10);
const repo = flag("repo") || defaultRepo(game);
const dryRun = has("dry-run");

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
  console.error(
    "usage: assetgen --id <id> --prompt <text> [--game scourge-survivors|deadlane|pactfall|starblight|shared]\n" +
      "                [--kind sprite|texture|icon] [--provider openai|fal|codex|mock] [--model gpt-image-2]\n" +
      "                [--size 1024] [--repo <game-repo-path>] [--dry-run]\n" +
      "                Default game repo lookup prefers ./games/<game> or ../games/<game>.",
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

const sub = kind === "sprite" ? "sprites" : kind === "texture" ? "textures" : kind;
const rel = `${sub}/${id}.webp`;
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
