import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const commandsDir = dirname(fileURLToPath(import.meta.url));
const srcDir = dirname(commandsDir); // packages/assetgen/src

/**
 * A buildable IP/product the Studio can target. Deadrot is the first; future
 * franchises register their own entries. See STUDIO-ARCHITECTURE.md.
 *
 * This is the seam that lets the Studio "select the IP I build" instead of
 * assetgen being hardwired to the single `../deadrotcom` sibling. When no
 * project is selected (no env set), the legacy sibling-path defaults in
 * `paths.ts` are used unchanged — so existing behaviour is preserved.
 */
export interface ProjectEntry {
  /** Stable IP id, e.g. "deadrot". Used by `ASSETGEN_IP` and the Studio picker. */
  id: string;
  /** Human label for the Studio picker. Defaults to `id`. */
  name?: string;
  /** Path to the product repo root (relative paths resolve against cwd). */
  root: string;
  /** Override the assets package dir. Defaults to `<root>/packages/assets`. */
  assetsDir?: string;
  /** Override the games root. Defaults to `<root>/apps/games`. */
  gamesRoot?: string;
}

export class UnknownProjectError extends Error {
  constructor(id: string, available: string[]) {
    super(
      `Unknown assetgen IP "${id}". Available: ${available.join(", ") || "(none)"}. ` +
        `Register it via ASSETGEN_PROJECTS, or point at a checkout with ASSETGEN_PROJECT_ROOT.`,
    );
    this.name = "UnknownProjectError";
  }
}

/** First existing path among the legacy Deadrot sibling candidates, else undefined. */
function deadrotRoot(): string | undefined {
  const cwd = process.cwd();
  const candidates = [join(cwd, "..", "deadrotcom"), join(srcDir, "..", "..", "..", "..", "deadrotcom")];
  return (
    candidates.find((c) => existsSync(join(c, "packages", "assets", "assets-catalog.json"))) ??
    candidates.find((c) => existsSync(c))
  );
}

function builtinProjects(): ProjectEntry[] {
  const root = deadrotRoot();
  return root ? [{ id: "deadrot", name: "Deadrot", root }] : [];
}

function normalize(entry: ProjectEntry): ProjectEntry {
  return { ...entry, root: isAbsolute(entry.root) ? entry.root : resolve(process.cwd(), entry.root) };
}

/** Parse `ASSETGEN_PROJECTS` — an inline JSON array, or a path to a JSON file. */
function envProjects(): ProjectEntry[] {
  const raw = process.env.ASSETGEN_PROJECTS?.trim();
  if (!raw) return [];
  let text = raw;
  if (!raw.startsWith("[")) {
    if (!existsSync(raw)) return [];
    text = readFileSync(raw, "utf8");
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ProjectEntry =>
        !!e && typeof e === "object" && typeof (e as ProjectEntry).id === "string" && typeof (e as ProjectEntry).root === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Known buildable projects: built-in (Deadrot) plus any registered via
 * `ASSETGEN_PROJECTS`. Later entries override built-ins by `id`. The Studio's
 * IP picker reads this list.
 */
export function listProjects(): ProjectEntry[] {
  const byId = new Map<string, ProjectEntry>();
  for (const e of [...builtinProjects(), ...envProjects()]) byId.set(e.id, normalize(e));
  return [...byId.values()];
}

export function findProject(id: string): ProjectEntry | undefined {
  return listProjects().find((p) => p.id === id);
}

/**
 * The explicitly-selected project, or `undefined` when nothing is configured.
 * Returning `undefined` is what keeps the legacy sibling-path defaults intact.
 * Precedence: `ASSETGEN_PROJECT_ROOT` (direct path) > `ASSETGEN_IP` (registry id).
 */
export function selectedProject(): ProjectEntry | undefined {
  const rootEnv = process.env.ASSETGEN_PROJECT_ROOT?.trim();
  if (rootEnv) return normalize({ id: "custom", name: "custom", root: rootEnv });

  const ip = process.env.ASSETGEN_IP?.trim();
  if (ip) {
    const found = findProject(ip);
    if (!found) throw new UnknownProjectError(ip, listProjects().map((p) => p.id));
    return found;
  }
  return undefined;
}

export function projectAssetsDir(p: ProjectEntry): string {
  if (p.assetsDir) return isAbsolute(p.assetsDir) ? p.assetsDir : resolve(p.root, p.assetsDir);
  return join(p.root, "packages", "assets");
}

export function projectGamesRoot(p: ProjectEntry): string {
  if (p.gamesRoot) return isAbsolute(p.gamesRoot) ? p.gamesRoot : resolve(p.root, p.gamesRoot);
  return join(p.root, "apps", "games");
}

export function projectRepo(p: ProjectEntry, game: string): string {
  return join(projectGamesRoot(p), game);
}
