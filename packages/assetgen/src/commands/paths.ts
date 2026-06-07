import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const commandsDir = dirname(fileURLToPath(import.meta.url));
const srcDir = dirname(commandsDir); // packages/assetgen/src

export function defaultAssetsDir(): string {
  const cwd = process.cwd();
  const candidates = [
    join(cwd, "..", "deadrotcom", "packages", "assets"),
    join(srcDir, "..", "..", "..", "..", "deadrotcom", "packages", "assets"),
    join(srcDir, "..", "..", "assets"),
  ];
  return candidates.find((candidate) => existsSync(join(candidate, "assets-catalog.json"))) ?? candidates[0]!;
}

export function defaultGamesRoot(): string {
  const cwd = process.cwd();
  for (const c of [join(cwd, "games"), join(cwd, "..", "games")]) {
    if (existsSync(c)) return c;
  }
  return join(cwd, "games");
}

export function defaultRepo(game: string): string {
  if (game === "shared") return process.cwd();
  const cwd = process.cwd();
  if (basename(cwd) === game) return cwd;

  const deadrotGamesPath = join(cwd, "..", "deadrotcom", "apps", "games", game);
  if (existsSync(deadrotGamesPath)) return deadrotGamesPath;

  const workspaceGamesPath = join(cwd, "games", game);
  if (existsSync(workspaceGamesPath)) return workspaceGamesPath;

  const siblingGamesPath = join(cwd, "..", "games", game);
  if (existsSync(siblingGamesPath)) return siblingGamesPath;

  return cwd;
}
