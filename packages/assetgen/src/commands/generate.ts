import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GAME_VIEW, buildPrompt } from "../style.ts";
import { providers } from "../providers.ts";
import { toWebp } from "../postprocess.ts";
import { register } from "../manifest.ts";
import { flag, has, intFlag } from "./args.ts";
import { defaultRepo } from "./paths.ts";

export async function runGenerate(argv: string[]): Promise<void> {
  const id = flag(argv, "id");
  const prompt = flag(argv, "prompt");
  const game = flag(argv, "game", "shared")!;
  const kind = flag(argv, "kind", "sprite")!;
  const provider = flag(argv, "provider", "openai")!;
  const model = flag(argv, "model", "gpt-image-2")!;
  const size = intFlag(argv, "size", 1024);
  const repo = flag(argv, "repo") || defaultRepo(game);
  const dryRun = has(argv, "dry-run");

  if (!id || !prompt) {
    printGenerateUsage();
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

  const raw = await gen(full, { size: `${size}x${size}`, model, log: (chunk) => process.stdout.write(chunk) });
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
}

function printGenerateUsage(): void {
  const views = Object.entries(GAME_VIEW)
    .map(([slug, v]) => `${slug} (${v})`)
    .join(", ");
  console.error(
    "usage:\n" +
      "  assetgen generate --id <id> --prompt <text> [--game <slug>|shared]\n" +
      "           [--kind sprite|texture|icon] [--provider openai|fal|codex|mock] [--model gpt-image-2]\n" +
      "           [--size 1024] [--repo <game-repo-path>] [--dry-run]\n" +
      "  assetgen --id <id> --prompt <text> [--game <slug>|shared]\n" +
      "           [--kind sprite|texture|icon] [--provider openai|fal|codex|mock] [--model gpt-image-2]\n" +
      "           [--size 1024] [--repo <game-repo-path>] [--dry-run]\n" +
      "  assetgen matrix [--game <slug>] [--id <entity>] [--provider mock|openai|fal|codex]\n" +
      "           [--size 1024] [--only-missing] [--dry-run] [--sync-games] [--assets-dir <path>]\n" +
      "  assetgen tokens [--check] [--design <path>] [--assets-dir <path>]\n" +
      "  assetgen pixelize --in <raw.png> --out <sprite.webp> [--height 110] [--bg 42]\n" +
      `\n  games: ${views}\n` +
      "  Default game repo lookup prefers ./games/<game> or ../games/<game>.",
  );
}
