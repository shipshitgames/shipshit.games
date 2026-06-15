// Scaffold smoke test (ci:scaffold).
//
// Drives the real `ssg new` CLI against a throwaway directory and asserts the
// stamped repository is complete and valid: agent entry points, memory seed,
// curated + genre skills, the executable worktree helper, the .claude/.codex
// symlinks into .agents/, the lore submodule declaration, and an initialized
// git repo. This replaces the earlier copy-the-repo smoke with one that
// exercises the published scaffolder end to end.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(repoRoot, "apps", "cli", "src", "cli.js");
const smokeRoot = mkdtempSync(join(tmpdir(), "shipshit-scaffold-"));
const stampedRepo = join(smokeRoot, "repo");

const requiredFiles = [
  "AGENTS.md",
  ".gitignore",
  ".codex/instructions.md",
  ".gitmodules",
  ".agents/memory/MEMORY.md",
  ".agents/memory/repo-boundary.md",
  ".agents/SYSTEM/.gitkeep",
  ".agents/SESSIONS/.gitkeep",
  ".agents/skills/session-start/SKILL.md",
  ".agents/skills/session-end/SKILL.md",
  ".agents/skills/worktree/SKILL.md",
  ".agents/skills/worktree/scripts/create-worktree.sh",
  ".agents/skills/shipshit-engine/SKILL.md",
  ".agents/skills/shipshit-engine/plugin.json",
  ".agents/skills/vibe-game-workflow/SKILL.md",
  ".agents/skills/vibe-game-workflow/plugin.json",
  ".agents/skills/survivors/SKILL.md",
  ".agents/skills/survivors/plugin.json",
];

const requiredSymlinks = [".claude/skills", ".claude/memory", ".codex/skills", ".codex/memory"];

const fail = (message) => {
  throw new Error(`scaffold smoke: ${message}`);
};

const assertExists = (relativePath) => {
  const fullPath = join(stampedRepo, relativePath);
  if (!existsSync(fullPath)) fail(`missing ${relativePath}`);
  return fullPath;
};

try {
  const run = spawnSync(
    process.execPath,
    [cliPath, "new", stampedRepo, "--name", "Scaffold Smoke", "--genre", "survivors"],
    { encoding: "utf8" },
  );
  if (run.status !== 0) {
    fail(`ssg new exited ${run.status}: ${run.stderr || run.stdout}`);
  }

  for (const relativePath of requiredFiles) assertExists(relativePath);

  // AGENTS.md must point agents at the memory docs and be fully rendered.
  const agentsInstructions = readFileSync(assertExists("AGENTS.md"), "utf8");
  for (const memoryPath of [".agents/memory/MEMORY.md", ".agents/memory/repo-boundary.md"]) {
    if (!agentsInstructions.includes(memoryPath)) fail(`AGENTS.md does not reference ${memoryPath}`);
  }
  if (agentsInstructions.includes("{{")) fail("AGENTS.md has unrendered tokens");

  // No template seam should leak unrendered tokens into stamped markdown.
  for (const relativePath of requiredFiles) {
    if (!relativePath.endsWith(".md")) continue;
    const contents = readFileSync(join(stampedRepo, relativePath), "utf8");
    if (contents.includes("{{")) fail(`${relativePath} has unrendered tokens`);
  }

  // The worktree helper must be executable.
  const worktreeScript = assertExists(".agents/skills/worktree/scripts/create-worktree.sh");
  if ((statSync(worktreeScript).mode & 0o111) === 0) fail("create-worktree.sh is not executable");

  // The .claude/.codex symlinks must exist and resolve into .agents/.
  for (const link of requiredSymlinks) {
    const linkPath = join(stampedRepo, link);
    if (!existsSync(linkPath) || !lstatSync(linkPath).isSymbolicLink()) {
      fail(`${link} is not a symlink`);
    }
    const resolved = resolve(dirname(linkPath), readlinkSync(linkPath));
    if (!existsSync(resolved)) fail(`broken symlink ${link}`);
  }

  // Any other symlinks the scaffolder created must also resolve.
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const resolved = resolve(dirname(full), readlinkSync(full));
        if (!existsSync(resolved)) fail(`broken symlink ${full}`);
      } else if (entry.isDirectory()) {
        walk(full);
      }
    }
  };
  walk(stampedRepo);

  // The lore submodule must be declared and the repo git-initialized.
  const gitmodules = readFileSync(assertExists(".gitmodules"), "utf8");
  if (!/\[submodule "/.test(gitmodules)) fail(".gitmodules has no submodule declaration");
  if (!existsSync(join(stampedRepo, ".git"))) fail("scaffolded repo was not git-initialized");

  console.log(`scaffold smoke passed: ${stampedRepo}`);
} finally {
  rmSync(smokeRoot, { force: true, recursive: true });
}
