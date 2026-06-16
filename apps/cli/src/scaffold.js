// new-repo scaffolder for Ship Shit Games game repos.
//
// `ssg new <dir>` stamps a fresh game repository with the proven studio layout:
//   - AGENTS.md + .codex/instructions.md agent entry points
//   - .agents/ (memory seed, SYSTEM/, SESSIONS/, curated skills)
//   - .claude/{memory,skills} and .codex/{memory,skills} symlinks into .agents/
//   - a curated subset of skills (session-start/-end, worktree, shipshit-engine,
//     vibe-game-workflow, and a parameterized genre skill)
//   - the Deadrot lore repo declared as a git submodule (offline, declarative)
//   - an initialized git repository
//
// The layout mirrors the canonical one in this monorepo and in shipshitgames/skills.

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Genre skills the scaffolder knows how to describe out of the box. */
export const KNOWN_GENRES = [
  "action",
  "survivors",
  "shooter",
  "platformer",
  "roguelike",
  "rpg",
  "puzzle",
  "racing",
  "strategy",
];

/** Default genre stamped when `--genre` is omitted. */
export const DEFAULT_GENRE = "action";

/**
 * Canonical Deadrot lore submodule. Override with `--lore-url` when the lore
 * repository lives elsewhere; the scaffolder only declares it in `.gitmodules`
 * (no network fetch), so an inaccurate default is harmless until someone runs
 * `git submodule update --init`.
 */
export const DEFAULT_LORE_URL = "https://github.com/shipshitgames/deadrot-lore.git";

/** Default in-repo path for the lore submodule. */
export const DEFAULT_LORE_PATH = ".lore";

/** Engine package every Ship Shit Games title consumes. */
export const ENGINE_PACKAGE = "@shipshitgames/engine";

/** Curated, always-stamped skills (the genre skill is added on top of these). */
export const CURATED_SKILLS = [
  "session-start",
  "session-end",
  "worktree",
  "shipshit-engine",
  "vibe-game-workflow",
];

/** Absolute path to the bundled templates directory. */
export const TEMPLATES_DIR = fileURLToPath(new URL("../templates", import.meta.url));

/**
 * Slugify an arbitrary name into a kebab-case identifier.
 * @param {string} input
 * @returns {string}
 */
export function slugify(input) {
  return String(input)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * @typedef {Object} ScaffoldOptions
 * @property {string} targetDir   Directory to stamp (relative paths resolved against cwd).
 * @property {string} [name]      Project name (defaults to the target dir basename).
 * @property {string} [genre]     Genre skill to stamp.
 * @property {string} [loreUrl]   Lore submodule URL.
 * @property {string} [lorePath]  Lore submodule path inside the repo.
 * @property {boolean} [submodule] Declare the lore submodule (default true).
 * @property {boolean} [git]      Run `git init` (default true).
 * @property {boolean} [force]    Allow stamping into a non-empty directory.
 * @property {boolean} [dryRun]   Compute the plan without writing.
 * @property {string} [lastVerified] Date stamped into the memory seed (testing seam).
 * @property {string} [cwd]       Base directory for resolving a relative targetDir.
 */

/**
 * @typedef {Object} ParsedArgs
 * @property {string | undefined} targetDir
 * @property {string | undefined} name
 * @property {string} genre
 * @property {string} loreUrl
 * @property {string} lorePath
 * @property {boolean} submodule
 * @property {boolean} git
 * @property {boolean} force
 * @property {boolean} dryRun
 * @property {boolean} help
 * @property {string[]} errors
 */

/**
 * Parse `ssg new` arguments.
 * @param {string[]} argv  Arguments after the `new`/`init` subcommand.
 * @returns {ParsedArgs}
 */
export function parseScaffoldArgs(argv) {
  /** @type {ParsedArgs} */
  const parsed = {
    targetDir: undefined,
    name: undefined,
    genre: DEFAULT_GENRE,
    loreUrl: DEFAULT_LORE_URL,
    lorePath: DEFAULT_LORE_PATH,
    submodule: true,
    git: true,
    force: false,
    dryRun: false,
    help: false,
    errors: [],
  };

  /**
   * @param {string} flag
   * @param {string | undefined} value
   */
  const requireValue = (flag, value) => {
    if (value === undefined) {
      parsed.errors.push(`missing value for ${flag}`);
      return "";
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    switch (arg) {
      case "-h":
      case "--help":
        parsed.help = true;
        break;
      case "--name":
        parsed.name = requireValue("--name", argv[++i]);
        break;
      case "--genre":
        parsed.genre = slugify(requireValue("--genre", argv[++i])) || DEFAULT_GENRE;
        break;
      case "--lore-url":
        parsed.loreUrl = requireValue("--lore-url", argv[++i]);
        break;
      case "--lore-path":
        parsed.lorePath = requireValue("--lore-path", argv[++i]);
        break;
      case "--no-submodule":
        parsed.submodule = false;
        break;
      case "--no-git":
        parsed.git = false;
        break;
      case "--force":
        parsed.force = true;
        break;
      case "--dry-run":
        parsed.dryRun = true;
        break;
      default:
        if (arg.startsWith("-")) {
          parsed.errors.push(`unknown flag: ${arg}`);
        } else if (parsed.targetDir === undefined) {
          parsed.targetDir = arg;
        } else {
          parsed.errors.push(`unexpected argument: ${arg}`);
        }
    }
  }

  if (!parsed.help && parsed.targetDir === undefined) {
    parsed.errors.push("missing target directory");
  }

  return parsed;
}

/**
 * Substitute `{{TOKEN}}` placeholders. Unknown tokens are left intact so they
 * surface loudly in review rather than silently vanishing.
 * @param {string} content
 * @param {Record<string, string>} vars
 * @returns {string}
 */
export function renderTemplate(content, vars) {
  return content.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    const value = vars[key];
    return value === undefined ? match : value;
  });
}

/**
 * Title-case a kebab/space separated string ("survivors" -> "Survivors").
 * @param {string} value
 * @returns {string}
 */
function titleCase(value) {
  return String(value)
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Build the template substitution map.
 * @param {{ name: string, slug: string, genre: string, loreUrl: string, lorePath: string, date: string }} input
 * @returns {Record<string, string>}
 */
export function buildVars({ name, slug, genre, loreUrl, lorePath, date }) {
  return {
    PROJECT_NAME: name,
    PROJECT_SLUG: slug,
    GENRE: genre,
    GENRE_TITLE: titleCase(genre),
    LORE_URL: loreUrl,
    LORE_PATH: lorePath,
    ENGINE_PACKAGE,
    DATE: date,
  };
}

/** Control characters (incl. newlines) that must never reach `.gitmodules`. */
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

/**
 * Reject a lore submodule path that could escape the repo or inject extra
 * `.gitmodules` config: it must be a non-empty, relative, traversal-free path
 * with no newlines or control characters.
 * @param {string} lorePath
 */
export function assertSafeLorePath(lorePath) {
  if (typeof lorePath !== "string" || lorePath.trim() === "") {
    throw new Error("scaffold: lore path must be a non-empty string");
  }
  if (CONTROL_CHARS.test(lorePath)) {
    throw new Error("scaffold: lore path must not contain newlines or control characters");
  }
  if (lorePath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(lorePath)) {
    throw new Error("scaffold: lore path must be relative to the repo root");
  }
  if (lorePath.split(/[\\/]/).some((segment) => segment === "..")) {
    throw new Error("scaffold: lore path must not traverse outside the repo (..)");
  }
}

/**
 * Reject a lore submodule URL containing newlines or control characters that
 * could inject additional `.gitmodules` entries.
 * @param {string} loreUrl
 */
export function assertSafeLoreUrl(loreUrl) {
  if (typeof loreUrl !== "string" || loreUrl.trim() === "") {
    throw new Error("scaffold: lore URL must be a non-empty string");
  }
  if (CONTROL_CHARS.test(loreUrl)) {
    throw new Error("scaffold: lore URL must not contain newlines or control characters");
  }
}

/**
 * Render the `.gitmodules` declaration for the lore submodule. Both inputs are
 * validated first so a malicious `--lore-path`/`--lore-url` cannot inject extra
 * config or escape the repo.
 * @param {string} lorePath
 * @param {string} loreUrl
 * @returns {string}
 */
export function gitmodulesContent(lorePath, loreUrl) {
  assertSafeLorePath(lorePath);
  assertSafeLoreUrl(loreUrl);
  return `[submodule "${lorePath}"]\n\tpath = ${lorePath}\n\turl = ${loreUrl}\n`;
}

/**
 * The relative symlinks that wire .claude/ and .codex/ into .agents/.
 * @returns {{ link: string, target: string }[]}
 */
export function symlinkPlan() {
  return [
    { link: ".claude/skills", target: "../.agents/skills" },
    { link: ".claude/memory", target: "../.agents/memory" },
    { link: ".codex/skills", target: "../.agents/skills" },
    { link: ".codex/memory", target: "../.agents/memory" },
  ];
}

/**
 * Recursively list files under a directory as paths relative to it.
 * @param {string} root
 * @returns {string[]}
 */
function listFiles(root) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(root, full));
    }
  };
  walk(root);
  return out;
}

/** A scaffold plan entry. */
/**
 * @typedef {Object} PlanEntry
 * @property {"file" | "symlink"} kind
 * @property {string} path        Repo-relative destination path.
 * @property {string} [source]    Absolute template source (for kind "file").
 * @property {boolean} [render]   Whether to render placeholders.
 * @property {boolean} [executable]
 * @property {string} [target]    Symlink target (for kind "symlink").
 * @property {string} [contents]  Inline contents (for generated files).
 */

/**
 * Build the ordered list of files/symlinks to create. Pure given the template
 * listing; the genre skill is mapped from `genre-skill/` into `.agents/skills/<genre>/`.
 * @param {{ templateFiles: string[], genreFiles: string[], options: { genre: string, submodule: boolean, lorePath: string, loreUrl: string } }} input
 * @returns {PlanEntry[]}
 */
export function buildPlan({ templateFiles, genreFiles, options }) {
  /** @type {PlanEntry[]} */
  const plan = [];

  /** @param {string} rel */
  const mapDest = (rel) => {
    if (rel === "AGENTS.md.tmpl") return "AGENTS.md";
    if (rel === "gitignore.tmpl") return ".gitignore";
    if (rel.startsWith("dot-agents/")) return rel.replace(/^dot-agents\//, ".agents/").replace(/\.tmpl$/, "");
    if (rel.startsWith("dot-codex/")) return rel.replace(/^dot-codex\//, ".codex/").replace(/\.tmpl$/, "");
    return rel.replace(/\.tmpl$/, "");
  };

  for (const rel of templateFiles) {
    if (rel.startsWith("genre-skill/")) continue; // handled below
    const dest = mapDest(rel);
    plan.push({
      kind: "file",
      path: dest,
      source: rel,
      render: rel.endsWith(".tmpl"),
      executable: dest.endsWith(".sh"),
    });
  }

  for (const rel of genreFiles) {
    const dest = join(".agents/skills", options.genre, rel.replace(/\.tmpl$/, ""));
    plan.push({
      kind: "file",
      path: dest,
      source: join("genre-skill", rel),
      render: rel.endsWith(".tmpl"),
      executable: false,
    });
  }

  // Keep otherwise-empty seed directories under version control.
  plan.push({ kind: "file", path: ".agents/SYSTEM/.gitkeep", contents: "" });
  plan.push({ kind: "file", path: ".agents/SESSIONS/.gitkeep", contents: "" });

  for (const { link, target } of symlinkPlan()) {
    plan.push({ kind: "symlink", path: link, target });
  }

  if (options.submodule) {
    plan.push({
      kind: "file",
      path: ".gitmodules",
      contents: gitmodulesContent(options.lorePath, options.loreUrl),
    });
  }

  return plan;
}

/**
 * @typedef {Object} ScaffoldResult
 * @property {string} targetDir
 * @property {string} name
 * @property {string} genre
 * @property {boolean} gitInitialized
 * @property {boolean} submoduleDeclared
 * @property {string[]} created   Repo-relative paths that were (or would be) created.
 * @property {boolean} dryRun
 */

/**
 * Stamp a new game repository.
 * @param {ScaffoldOptions} options
 * @returns {ScaffoldResult}
 */
export function scaffold(options) {
  if (!options || !options.targetDir) {
    throw new Error("scaffold: targetDir is required");
  }

  const cwd = options.cwd ?? process.cwd();
  const targetDir = resolve(cwd, options.targetDir);
  const name = options.name && options.name.trim() ? options.name.trim() : basename(targetDir);
  const slug = slugify(name) || "game";
  const genre = options.genre ? slugify(options.genre) || DEFAULT_GENRE : DEFAULT_GENRE;
  const loreUrl = options.loreUrl ?? DEFAULT_LORE_URL;
  const lorePath = options.lorePath ?? DEFAULT_LORE_PATH;
  const submodule = options.submodule !== false;
  const git = options.git !== false;
  const force = options.force === true;
  const dryRun = options.dryRun === true;
  const date = options.lastVerified ?? new Date().toISOString().slice(0, 10);

  if (existsSync(targetDir)) {
    const stat = statSync(targetDir);
    if (!stat.isDirectory()) {
      throw new Error(`scaffold: target ${targetDir} exists and is not a directory`);
    }
    if (readdirSync(targetDir).length > 0 && !force && !dryRun) {
      throw new Error(
        `scaffold: target ${targetDir} is not empty (pass --force to stamp into it anyway)`,
      );
    }
  }

  const vars = buildVars({ name, slug, genre, loreUrl, lorePath, date });
  const templateFiles = listFiles(TEMPLATES_DIR).filter((rel) => !rel.startsWith("genre-skill/"));
  const genreFiles = listFiles(join(TEMPLATES_DIR, "genre-skill"));
  const plan = buildPlan({ templateFiles, genreFiles, options: { genre, submodule, lorePath, loreUrl } });

  /** @type {string[]} */
  const created = [];

  /** @param {string} relPath */
  const ensureParent = (relPath) => {
    const parent = dirname(join(targetDir, relPath));
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  };

  for (const entry of plan) {
    const abs = join(targetDir, entry.path);
    // `existsSync` follows symlinks, so a *broken* link reads as absent; OR in an
    // explicit lstat check so we treat dangling links as "present" too. Anything
    // already on disk is left untouched (and uncounted) unless --force is set.
    const present = existsSync(abs) || isSymlink(abs);
    if (present && !force) {
      continue;
    }
    if (dryRun) {
      created.push(entry.path);
      continue;
    }
    ensureParent(entry.path);
    if (entry.kind === "symlink" && entry.target) {
      // Forcing: drop any existing (possibly broken) link before recreating it.
      if (present) rmSymlink(abs);
      try {
        symlinkSync(entry.target, abs);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(
          `scaffold: failed to create symlink ${entry.path} -> ${entry.target}: ${reason}. ` +
            "On Windows, symlinks require Developer Mode or an elevated shell.",
        );
      }
    } else if (entry.contents !== undefined) {
      writeFileSync(abs, entry.contents);
    } else if (entry.source) {
      const sourceAbs = join(TEMPLATES_DIR, entry.source);
      if (entry.render) {
        writeFileSync(abs, renderTemplate(readFileSync(sourceAbs, "utf8"), vars));
      } else {
        cpSync(sourceAbs, abs);
      }
      if (entry.executable) chmodSync(abs, 0o755);
    }
    created.push(entry.path);
  }

  let gitInitialized = false;
  if (git && !dryRun) {
    if (existsSync(join(targetDir, ".git"))) {
      gitInitialized = true;
    } else {
      const result = spawnSync("git", ["init", "--quiet"], { cwd: targetDir, stdio: "ignore" });
      gitInitialized = result.status === 0;
    }
  }

  return {
    targetDir,
    name,
    genre,
    gitInitialized,
    submoduleDeclared: submodule,
    created,
    dryRun,
  };
}

/**
 * @param {string} p
 * @returns {boolean}
 */
function isSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/** @param {string} p */
function rmSymlink(p) {
  try {
    unlinkSync(p);
  } catch {
    /* best effort */
  }
}
