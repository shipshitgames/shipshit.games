// `ssg new` / `ssg init` command handler: parse args, scaffold, report.

import { relative, resolve } from "node:path";
import {
  DEFAULT_GENRE,
  DEFAULT_LORE_PATH,
  DEFAULT_LORE_URL,
  KNOWN_GENRES,
  parseScaffoldArgs,
  scaffold,
} from "./scaffold.js";

const HELP = `shipshitgames new <dir> [options]

Scaffold a new Ship Shit Games game repository: AGENTS.md, .agents/ memory +
curated skills, .claude/.codex symlinks, the lore submodule, and a git repo.

options:
  --name <name>        Project name (default: target directory name)
  --genre <genre>      Genre skill to stamp (default: ${DEFAULT_GENRE})
                       known: ${KNOWN_GENRES.join(", ")}
  --lore-url <url>     Lore submodule URL (default: ${DEFAULT_LORE_URL})
  --lore-path <path>   Lore submodule path (default: ${DEFAULT_LORE_PATH})
  --no-submodule       Skip declaring the lore submodule
  --no-git             Skip "git init"
  --force              Stamp into a non-empty directory (overwrites collisions)
  --dry-run            Print what would be created without writing
  -h, --help           Show this help

example:
  shipshitgames new ../my-game --name "My Game" --genre survivors
`;

/**
 * @param {string[]} argv
 * @param {{ stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream, cwd?: string }} [io]
 * @returns {number} process exit code
 */
export function runNewCommand(argv, io = {}) {
  const out = io.stdout ?? process.stdout;
  const err = io.stderr ?? process.stderr;
  const cwd = io.cwd ?? process.cwd();

  const parsed = parseScaffoldArgs(argv);

  if (parsed.help) {
    out.write(HELP);
    return 0;
  }

  if (parsed.errors.length > 0) {
    for (const message of parsed.errors) err.write(`error: ${message}\n`);
    err.write(`\n${HELP}`);
    return 1;
  }

  try {
    const result = scaffold({
      targetDir: /** @type {string} */ (parsed.targetDir),
      name: parsed.name,
      genre: parsed.genre,
      loreUrl: parsed.loreUrl,
      lorePath: parsed.lorePath,
      submodule: parsed.submodule,
      git: parsed.git,
      force: parsed.force,
      dryRun: parsed.dryRun,
      cwd,
    });

    const rel = relative(cwd, result.targetDir) || ".";
    const verb = result.dryRun ? "would create" : "created";
    out.write(
      `${result.dryRun ? "[dry-run] " : ""}Scaffolded ${result.name} (${result.genre}) at ${rel}\n`,
    );
    out.write(`  ${verb} ${result.created.length} entries\n`);
    if (result.submoduleDeclared) {
      out.write(`  lore submodule declared in .gitmodules (run: git submodule update --init)\n`);
    }
    if (!result.dryRun) {
      out.write(`  git: ${result.gitInitialized ? "initialized" : "not initialized"}\n`);
      out.write(`\nnext:\n  cd ${rel}\n  bun install\n`);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    err.write(`error: ${message}\n`);
    return 1;
  }
}

// Allow `node src/new-command.js <dir>` for ad-hoc runs / smoke harnesses.
if (resolve(process.argv[1] ?? "") === resolve(new URL(import.meta.url).pathname)) {
  process.exit(runNewCommand(process.argv.slice(2)));
}
