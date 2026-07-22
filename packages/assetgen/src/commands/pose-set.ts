import { generatePoseSet } from "../pose-set.ts";
import { flag, has, intFlag } from "./args.ts";
import { defaultAssetsDir } from "./paths.ts";

export async function runPoseSetCommand(argv: string[]): Promise<void> {
  const entityId = flag(argv, "entity");
  const game = flag(argv, "game");
  if (!entityId || !game) {
    printPoseSetUsage();
    process.exit(1);
  }

  const provider = has(argv, "dry-run")
    ? "mock"
    : flag(argv, "provider", "mock")!;
  const result = await generatePoseSet({
    assetsDir: flag(argv, "assets-dir") || defaultAssetsDir(),
    entityId,
    game,
    provider,
    model: flag(argv, "model"),
    size: intFlag(argv, "size", 1024),
    height: intFlag(argv, "height", 110),
    seed: seedFlag(argv),
    licenseTerms: flag(argv, "license"),
    licenseUrl: flag(argv, "license-url"),
    usageLogPath: flag(argv, "usage-log"),
    dryRun: has(argv, "dry-run"),
    log: (chunk) => process.stdout.write(chunk),
  });
  console.log(
    `[pose-set] ${result.written ? "wrote" : "planned"} ${result.manifest.entityId}/${result.manifest.game} -> ${result.manifestPath}`,
  );
}

function seedFlag(argv: string[]): number | undefined {
  const raw = flag(argv, "seed");
  if (raw === undefined) return undefined;
  const seed = Number.parseInt(raw, 10);
  return Number.isFinite(seed) && seed >= 0 ? seed : undefined;
}

function printPoseSetUsage(): void {
  console.error(
    "usage:\n" +
      "  assetgen pose-set --entity <catalog-entity-id> --game <slug>\n" +
      "           [--assets-dir <asset-package>] [--provider mock|openai|fal|codex]\n" +
      "           [--model <model>] [--size 1024] [--height 110] [--seed <n>]\n" +
      "           [--license <terms>] [--license-url <url>] [--usage-log <path|off>] [--dry-run]\n" +
      "\n" +
      "  The selected catalog variant must be a promoted local image. Generates\n" +
      "  idle/walk/attack/hit/death references under sources/pose-sets/.",
  );
}
