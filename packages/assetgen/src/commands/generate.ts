import { GAME_VIEW, buildPrompt } from "../style.ts";
import { defaultProviderForKind } from "../providers.ts";
import { runAssetPipeline } from "../pipeline.ts";
import { flag, has, intFlag } from "./args.ts";
import { defaultRepo } from "./paths.ts";

export async function runGenerate(argv: string[]): Promise<void> {
  const id = flag(argv, "id");
  const prompt = flag(argv, "prompt");
  const game = flag(argv, "game", "shared")!;
  const kind = flag(argv, "kind", "sprite")!;
  const provider = flag(argv, "provider") || defaultProviderForKind(kind);
  const model = flag(argv, "model");
  const size = intFlag(argv, "size", 1024);
  const repo = flag(argv, "repo") || defaultRepo(game);
  const dryRun = has(argv, "dry-run");
  const usageLog = flag(argv, "usage-log");

  if (!id || !prompt) {
    printGenerateUsage();
    process.exit(1);
  }

  const full = buildPrompt({ prompt, game, kind });
  const which = dryRun ? "mock" : provider;
  console.log(`[assetgen] provider=${which}${model ? ` model=${model}` : ""} game=${game} kind=${kind} id=${id}`);
  console.log(`[prompt] ${full}`);

  await runAssetPipeline({
    id,
    prompt,
    game,
    kind,
    provider: which,
    model,
    size,
    repo,
    usageLogPath: usageLog,
    log: (chunk) => process.stdout.write(chunk),
  });
}

function printGenerateUsage(): void {
  const views = Object.entries(GAME_VIEW)
    .map(([slug, v]) => `${slug} (${v})`)
    .join(", ");
  console.error(
    "usage:\n" +
      "  assetgen generate --id <id> --prompt <text> [--game <slug>|shared]\n" +
      "           [--kind sprite|texture|icon|music|sfx|voice|model] [--provider openai|fal|codex|replicate|suno|mock]\n" +
      "           [--model <model>] [--size 1024] [--repo <game-repo-path>] [--usage-log <path|off>] [--dry-run]\n" +
      "  assetgen --id <id> --prompt <text> [--game <slug>|shared]\n" +
      "           [--kind sprite|texture|icon|music|sfx|voice|model] [--provider openai|fal|codex|replicate|suno|mock]\n" +
      "           [--model <model>] [--size 1024] [--repo <game-repo-path>] [--usage-log <path|off>] [--dry-run]\n" +
      "  assetgen matrix [--game <slug>] [--id <entity>] [--provider mock|openai|fal|codex|replicate]\n" +
      "           [--size 1024] [--only-missing] [--dry-run] [--sync-games] [--assets-dir <path>] [--usage-log <path|off>]\n" +
      "  assetgen games [--check] [--games-root <path>] [--assets-dir <path>]\n" +
      "  assetgen tokens [--check] [--design <path>] [--assets-dir <path>]\n" +
      "  assetgen check-design [--root <repo>]\n" +
      "  assetgen pixelize --in <raw.png> --out <sprite.webp> [--height 110] [--bg 42]\n" +
      `\n  games: ${views}\n` +
      "  Default game repo lookup prefers ./games/<game> or ../games/<game>.",
  );
}
