// End-to-end: run the published CLI binary against a throwaway directory and
// assert the full stamped repository — files, rendered tokens, executable
// helper, symlinks, .gitmodules, and an initialized git repo.

import assert from "node:assert/strict";
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
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const cliPath = join(pkgDir, "src", "cli.js");
const githubTemplateFiles = [
  "ISSUE_TEMPLATE/bug.yml",
  "ISSUE_TEMPLATE/config.yml",
  "ISSUE_TEMPLATE/feature.yml",
  "ISSUE_TEMPLATE/task.yml",
  "pull_request_template.md",
];

/** @type {string[]} */
const tempDirs = [];
/** @returns {string} */
function makeTemp() {
  const dir = mkdtempSync(join(tmpdir(), "ssg-scaffold-e2e-"));
  tempDirs.push(dir);
  return dir;
}
after(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
});

/**
 * @param {string[]} args
 * @param {string} cwd
 */
function runCli(args, cwd) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: "utf8" });
}

/**
 * Walk a tree and collect symlink paths.
 * @param {string} root
 * @returns {string[]}
 */
function findSymlinks(root) {
  /** @type {string[]} */
  const links = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) links.push(full);
      else if (entry.isDirectory()) walk(full);
    }
  };
  walk(root);
  return links;
}

test("ssg new stamps a complete, valid game repo", () => {
  const base = makeTemp();
  const run = runCli(["new", "game", "--name", "Breach Run", "--genre", "survivors"], base);
  assert.equal(run.status, 0, `cli failed: ${run.stderr}`);
  assert.match(run.stdout, /Scaffolded Breach Run \(survivors\)/);

  const dir = join(base, "game");

  // entry points
  for (const file of [
    "AGENTS.md",
    ".gitignore",
    ".codex/instructions.md",
    ".gitmodules",
    ".github/ISSUE_TEMPLATE/bug.yml",
    ".github/ISSUE_TEMPLATE/feature.yml",
    ".github/ISSUE_TEMPLATE/task.yml",
    ".github/ISSUE_TEMPLATE/config.yml",
    ".github/pull_request_template.md",
  ]) {
    assert.ok(existsSync(join(dir, file)), `missing ${file}`);
  }
  for (const file of githubTemplateFiles) {
    const generated = readFileSync(join(dir, ".github", file));
    const bundled = readFileSync(join(pkgDir, "templates/dot-github", file));
    assert.deepEqual(generated, bundled, `${file} was not copied byte-for-byte`);
  }

  // AGENTS.md references both memory docs and is fully rendered
  const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.ok(agents.includes(".agents/memory/MEMORY.md"));
  assert.ok(agents.includes(".agents/memory/repo-boundary.md"));
  assert.ok(agents.includes("Breach Run"));
  assert.ok(!agents.includes("{{"), "AGENTS.md has unrendered tokens");

  // memory seed
  for (const mem of ["MEMORY.md", "repo-boundary.md"]) {
    const text = readFileSync(join(dir, ".agents/memory", mem), "utf8");
    assert.ok(!text.includes("{{"), `${mem} has unrendered tokens`);
  }

  // curated + genre skills present and rendered
  for (const skill of [
    "session-start",
    "session-end",
    "worktree",
    "shipshit-engine",
    "vibe-game-workflow",
    "survivors",
  ]) {
    const skillFile = join(dir, ".agents/skills", skill, "SKILL.md");
    assert.ok(existsSync(skillFile), `missing skill ${skill}`);
    assert.ok(existsSync(join(dir, ".agents/skills", skill, "plugin.json")), `missing plugin ${skill}`);
  }
  for (const tmpl of ["shipshit-engine", "vibe-game-workflow", "survivors"]) {
    const text = readFileSync(join(dir, ".agents/skills", tmpl, "SKILL.md"), "utf8");
    assert.ok(!text.includes("{{"), `${tmpl} SKILL.md has unrendered tokens`);
  }

  // worktree helper executable
  const script = join(dir, ".agents/skills/worktree/scripts/create-worktree.sh");
  assert.notEqual(statSync(script).mode & 0o111, 0, "worktree script not executable");

  // seed dirs kept under version control
  assert.ok(existsSync(join(dir, ".agents/SYSTEM/.gitkeep")));
  assert.ok(existsSync(join(dir, ".agents/SESSIONS/.gitkeep")));

  // every symlink resolves
  const links = findSymlinks(dir).filter((p) => !p.includes("/.git/"));
  const linkNames = links.map((p) => p.slice(dir.length + 1)).sort();
  assert.deepEqual(linkNames, [".claude/memory", ".claude/skills", ".codex/memory", ".codex/skills"]);
  for (const link of links) {
    const resolved = resolve(dirname(link), readlinkSync(link));
    assert.ok(existsSync(resolved), `dangling symlink ${link}`);
  }

  // submodule declared, git initialized
  assert.match(readFileSync(join(dir, ".gitmodules"), "utf8"), /\[submodule "\.lore"\]/);
  assert.ok(lstatSync(join(dir, ".git")).isDirectory(), "git repo not initialized");
});

test("ssg new --dry-run writes nothing", () => {
  const base = makeTemp();
  const run = runCli(["new", "game", "--dry-run"], base);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /\[dry-run\]/);
  assert.ok(!existsSync(join(base, "game")));
});

test("ssg init is an alias for new", () => {
  const base = makeTemp();
  const run = runCli(["init", "game", "--no-git", "--no-submodule"], base);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(existsSync(join(base, "game", "AGENTS.md")));
  assert.ok(!existsSync(join(base, "game", ".git")));
  assert.ok(!existsSync(join(base, "game", ".gitmodules")));
});

test("ssg new fails on a non-empty target without --force", () => {
  const base = makeTemp();
  // first stamp succeeds
  assert.equal(runCli(["new", "game"], base).status, 0);
  // second stamp into the now-populated dir fails
  const second = runCli(["new", "game"], base);
  assert.equal(second.status, 1);
  assert.match(second.stderr, /not empty/);
});

test("ssg new --force re-stamps a non-empty target", () => {
  const base = makeTemp();
  assert.equal(runCli(["new", "game", "--no-git"], base).status, 0);
  const dir = join(base, "game");
  // a user file in the populated dir survives the forced re-stamp
  writeFileSync(join(dir, "USERNOTES.md"), "keep me");
  const forced = runCli(["new", "game", "--no-git", "--force"], base);
  assert.equal(forced.status, 0, `forced stamp failed: ${forced.stderr}`);
  assert.equal(readFileSync(join(dir, "USERNOTES.md"), "utf8"), "keep me");
  assert.ok(existsSync(join(dir, "AGENTS.md")));
});
