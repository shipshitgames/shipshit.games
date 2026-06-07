import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GAME_VIEW, buildPrompt } from "../style.ts";
import { defaultProviderForKind, generateAsset } from "../providers.ts";
import { toWebp } from "../postprocess.ts";
import { register } from "../manifest.ts";
import { appendUsageLog } from "../usage.ts";
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
  const start = Date.now();
  let ok = false;
  let outPath: string | undefined;
  let usedModel: string | undefined = model;
  let usageError: unknown;

  console.log(`[assetgen] provider=${which}${model ? ` model=${model}` : ""} game=${game} kind=${kind} id=${id}`);
  console.log(`[prompt] ${full}`);

  try {
    const generated = await generateAsset(kind, full, {
      provider: which,
      size: `${size}x${size}`,
      model,
      log: (chunk) => process.stdout.write(chunk),
    });
    usedModel = generated.model;

    let bytes = generated.data;
    let extension = generated.extension;
    let mediaType = generated.mediaType;
    if (generated.mediaType.startsWith("image/")) {
      bytes = await toWebp(generated.data, { size });
      extension = "webp";
      mediaType = "image/webp";
    }

    const rel = `${subdirForKind(kind)}/${id}.${extension}`;
    outPath = join(repo, "src/assets", rel);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, bytes);
    console.log(`[wrote] ${outPath} (${(bytes.length / 1024).toFixed(1)} kb, ${mediaType})`);

    await register(join(repo, "src/assets/assets.json"), {
      id,
      kind,
      game,
      path: rel,
      prompt,
      provider: generated.provider,
    });
    console.log(`[manifest] ${join(repo, "src/assets/assets.json")} updated`);
    ok = true;
  } catch (error) {
    usageError = error;
    throw error;
  } finally {
    try {
      const logPath = await appendUsageLog(
        {
          command: "generate",
          provider: which,
          kind,
          game,
          id,
          model: usedModel,
          size,
          outputPath: outPath,
          prompt,
          success: ok,
          durationMs: Date.now() - start,
          error: usageError,
        },
        usageLog,
      );
      if (logPath) console.log(`[usage] ${logPath}`);
    } catch (error) {
      console.warn(`[usage] failed to write usage log: ${String((error as Error)?.message ?? error)}`);
    }
  }
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
      "  assetgen tokens [--check] [--design <path>] [--assets-dir <path>]\n" +
      "  assetgen pixelize --in <raw.png> --out <sprite.webp> [--height 110] [--bg 42]\n" +
      `\n  games: ${views}\n` +
      "  Default game repo lookup prefers ./games/<game> or ../games/<game>.",
  );
}

function subdirForKind(kind: string): string {
  if (kind === "sprite") return "sprites";
  if (kind === "texture") return "textures";
  if (kind === "icon") return "icons";
  if (kind === "music" || kind === "sfx" || kind === "voice") return `audio/${kind}`;
  if (kind === "model" || kind === "3d") return "models";
  return kind;
}
