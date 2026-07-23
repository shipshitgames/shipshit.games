import fs from "node:fs";
import path from "node:path";

import type {
  LoreNoteSummary,
  LoreVaultState,
  PlayLabContext,
  PlayLabGameSummary,
  PlayLabMapSummary,
  PlayLabProjectSummary,
} from "../shared/ipc";
import type { createLoreVaultStore } from "./lore-vault";

const LORE_ROOT_REL = path.join("apps", "lore", "content");
const GAMES_ROOT_REL = path.join("apps", "games");
const ASSETS_ROOT_REL = path.join("packages", "assets");
const MAX_PROMPT_CONTEXT_CHARS = 18_000;
const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "test-results",
]);

export interface PlayLabProjectRecord {
  id: string;
  name: string;
  slug: string;
  repoPath: string;
  source?: "registered" | "discovered";
}

interface PlayLabStoreOptions {
  projects: PlayLabProjectRecord[] | (() => PlayLabProjectRecord[]);
  activeProjectId: string | (() => string);
  loreVault: ReturnType<typeof createLoreVaultStore>;
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ") || "Game";
}

function slugify(value: string): string {
  return String(value || "game")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "game";
}

function readJson(file: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function readPackageName(dir: string): string | null {
  const data = readJson(path.join(dir, "package.json")) as { name?: unknown } | null;
  return typeof data?.name === "string" && data.name.trim() ? data.name.trim() : null;
}

function readScripts(dir: string): Record<string, string> {
  const data = readJson(path.join(dir, "package.json")) as { scripts?: unknown } | null;
  if (!data?.scripts || typeof data.scripts !== "object" || Array.isArray(data.scripts)) return {};
  return Object.fromEntries(
    Object.entries(data.scripts).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function safeReadDir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function relativePosix(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

function walkFiles(
  root: string,
  options: { maxFiles: number; maxDepth: number; include: (file: string) => boolean },
): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (stack.length && files.length < options.maxFiles) {
    const current = stack.pop()!;
    for (const entry of safeReadDir(current.dir).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (current.depth < options.maxDepth && !IGNORE_DIRS.has(entry.name)) {
          stack.push({ dir: full, depth: current.depth + 1 });
        }
      } else if (entry.isFile() && options.include(full)) {
        files.push(full);
        if (files.length >= options.maxFiles) break;
      }
    }
  }
  return files.sort((a, b) => relativePosix(root, a).localeCompare(relativePosix(root, b)));
}

function findMapFiles(gamePath: string): PlayLabMapSummary[] {
  const sourceRoot = path.join(gamePath, "src");
  return walkFiles(sourceRoot, {
    maxFiles: 40,
    maxDepth: 8,
    include(file) {
      const relativePath = relativePosix(sourceRoot, file).toLowerCase();
      return /\.(ts|tsx|json|ldtk)$/.test(relativePath)
        && (relativePath.includes("/map") || relativePath.includes("maps."));
    },
  }).map((file) => ({
    id: slugify(path.basename(file).replace(/\.[^.]+$/, "")),
    path: relativePosix(gamePath, file),
  }));
}

function listGames(repoPath: string): PlayLabGameSummary[] {
  const gamesRoot = path.join(repoPath, GAMES_ROOT_REL);
  const games: PlayLabGameSummary[] = [];
  for (const entry of safeReadDir(gamesRoot)) {
    if (!entry.isDirectory()) continue;
    const gamePath = path.join(gamesRoot, entry.name);
    games.push({
      slug: slugify(entry.name),
      name: titleFromSlug(entry.name),
      path: gamePath,
      packageName: readPackageName(gamePath),
      scripts: readScripts(gamePath),
      maps: findMapFiles(gamePath),
    });
  }
  return games.sort((a, b) => a.slug.localeCompare(b.slug));
}

function projects(options: PlayLabStoreOptions): PlayLabProjectRecord[] {
  const records = typeof options.projects === "function" ? options.projects() : options.projects;
  const seen = new Set<string>();
  return (records || []).filter((record) => {
    if (!record?.repoPath) return false;
    const key = path.resolve(record.repoPath);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function activeProjectId(options: PlayLabStoreOptions): string {
  return typeof options.activeProjectId === "function"
    ? options.activeProjectId()
    : options.activeProjectId;
}

function summarizeProject(
  record: PlayLabProjectRecord,
  selectedProjectId: string,
  loreState: LoreVaultState,
): PlayLabProjectSummary {
  const repoPath = path.resolve(record.repoPath);
  const exists = fs.existsSync(repoPath);
  const loreRoot = path.join(repoPath, LORE_ROOT_REL);
  const gamesRoot = path.join(repoPath, GAMES_ROOT_REL);
  const assetsRoot = path.join(repoPath, ASSETS_ROOT_REL);
  const assetCatalogPath = path.join(assetsRoot, "assets-catalog.json");
  const assetIndexPath = path.join(assetsRoot, "assets.index.json");
  const games = exists ? listGames(repoPath) : [];
  const loreExists = fs.existsSync(loreRoot);
  const assetsExists = fs.existsSync(assetsRoot);
  const valid = exists && (loreExists || games.length > 0 || assetsExists);
  return {
    ...record,
    repoPath,
    source: record.source === "discovered" ? "discovered" : "registered",
    isActive: record.id === selectedProjectId,
    exists,
    valid,
    error: exists
      ? valid
        ? loreState.error
        : "Not a recognized IP repo: expected apps/lore/content, apps/games, or packages/assets"
      : "Repository path does not exist",
    packageName: exists ? readPackageName(repoPath) : null,
    loreRoot,
    loreExists,
    loreFileCount: loreState.notes.length,
    gamesRoot,
    games,
    assetsRoot,
    assetsExists,
    assetCatalogPath,
    assetCatalogExists: fs.existsSync(assetCatalogPath),
    assetIndexPath,
    assetIndexExists: fs.existsSync(assetIndexPath),
  };
}

function buildPromptContext(
  project: PlayLabProjectSummary,
  lore: LoreNoteSummary[],
): { text: string; truncated: boolean } {
  const gameLines = project.games.map((game) => {
    const dev = game.scripts.dev ? ` dev="${game.scripts.dev}"` : "";
    const maps = game.maps.slice(0, 5).map((map) => map.path).join(", ");
    return `- ${game.slug}${dev}${maps ? ` maps=[${maps}]` : ""}`;
  });
  const chunks = [
    `Repo: ${project.name} (${project.repoPath})`,
    `Lore root: ${project.loreRoot}`,
    `Assets root: ${project.assetsRoot}`,
    gameLines.length ? `Games:\n${gameLines.join("\n")}` : "Games: none discovered",
    ...lore.map((note) => `## ${note.title}\nPath: ${note.path}\n${note.excerpt}`),
  ];
  const full = chunks.join("\n\n").trim();
  if (full.length <= MAX_PROMPT_CONTEXT_CHARS) return { text: full, truncated: false };
  return {
    text: `${full.slice(0, MAX_PROMPT_CONTEXT_CHARS)}\n\n[context truncated]`,
    truncated: true,
  };
}

export function createPlayLabStore(options: PlayLabStoreOptions) {
  function context(projectId?: string, refresh = false): PlayLabContext | null {
    const records = projects(options);
    const requestedId = projectId || activeProjectId(options);
    const project = records.find((record) => record.id === requestedId) || records[0];
    if (!project) return null;
    const lore = options.loreVault.list(project.id, refresh);
    const summary = summarizeProject(project, project.id, lore);
    const prompt = buildPromptContext(summary, lore.notes);
    return {
      project: summary,
      lore: lore.notes,
      games: summary.games,
      promptContext: prompt.text,
      truncated: prompt.truncated,
    };
  }

  return { context };
}

export { MAX_PROMPT_CONTEXT_CHARS };
