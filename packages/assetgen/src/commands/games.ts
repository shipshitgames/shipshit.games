import { existsSync } from "node:fs";
import { runGamesDiscovery } from "../games.ts";
import { flag, has } from "./args.ts";
import { defaultAssetsDir, defaultGamesRoot } from "./paths.ts";

export async function runGamesCommand(argv: string[]): Promise<void> {
  const assetsDir = flag(argv, "assets-dir") || defaultAssetsDir();
  const gamesRoot = flag(argv, "games-root") || defaultGamesRoot();

  if (!existsSync(assetsDir)) {
    console.error(`[games] assets package not found: ${assetsDir} — pass --assets-dir <@shipshitgames/assets path>`);
    process.exit(1);
  }

  const res = await runGamesDiscovery({
    assetsDir,
    gamesRoot,
    check: has(argv, "check"),
    log: (m) => console.log(m),
  });

  if (res.drift) {
    console.error("[games] drift detected — run 'bun assetgen games' and commit games.json.");
    process.exit(1);
  }

  console.log(`[games] ${res.games.length} game target(s) discovered`);
}
