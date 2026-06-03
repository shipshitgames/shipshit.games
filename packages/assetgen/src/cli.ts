#!/usr/bin/env bun
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
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
const size = parseInt(flag("size", "1024")!, 10);
const repo = flag("repo", process.cwd())!;
const dryRun = has("dry-run");

if (!id || !prompt) {
  console.error(
    "usage: assetgen --id <id> --prompt <text> [--game scourge-survivors|deadlane|bloodlane|shared]\n" +
      "                [--kind sprite|texture|icon] [--provider openai|fal|codex|mock]\n" +
      "                [--size 1024] [--repo <game-repo-path>] [--dry-run]",
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

console.log(`[assetgen] provider=${which} game=${game} kind=${kind} id=${id}`);
console.log(`[prompt] ${full}`);

const raw = await gen(full, { size: `${size}x${size}` });
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
