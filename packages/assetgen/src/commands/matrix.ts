import { existsSync } from "node:fs";
import { join } from "node:path";
import { runMatrix } from "../matrix.ts";
import type { GameSlug } from "../matrix.ts";
import { flag, has, intFlag } from "./args.ts";
import { defaultAssetsDir, defaultGamesRoot } from "./paths.ts";

export async function runMatrixCommand(argv: string[]): Promise<void> {
  const assetsDir = flag(argv, "assets-dir") || defaultAssetsDir();
  if (!existsSync(join(assetsDir, "assets-catalog.json"))) {
    console.error(`[matrix] no assets-catalog.json under ${assetsDir} — pass --assets-dir <@shipshitgames/assets path>`);
    process.exit(1);
  }
  const res = await runMatrix({
    assetsDir,
    provider: flag(argv, "provider", "mock")!, // mock by default: safe to batch the whole matrix with no keys
    model: flag(argv, "model", "gpt-image-2"),
    size: intFlag(argv, "size", 1024),
    game: flag(argv, "game") as GameSlug | undefined,
    id: flag(argv, "id"),
    onlyMissing: has(argv, "only-missing"),
    dryRun: has(argv, "dry-run"),
    syncGames: has(argv, "sync-games"),
    gamesRoot: flag(argv, "games-root") || defaultGamesRoot(),
    usageLogPath: flag(argv, "usage-log"),
    log: (m) => console.log(m),
  });
  console.log(`[matrix] done: ${res.generated} generated, ${res.skipped} skipped of ${res.jobs} cell(s)`);
}
