import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import {
  assertSafeLorePath,
  assertSafeLoreUrl,
  buildPlan,
  buildVars,
  DEFAULT_GENRE,
  DEFAULT_LORE_PATH,
  DEFAULT_LORE_URL,
  gitmodulesContent,
  parseScaffoldArgs,
  renderTemplate,
  scaffold,
  slugify,
  symlinkPlan,
} from "../src/scaffold.js";

/** @type {string[]} */
const tempDirs = [];

/** @returns {string} */
function makeTemp() {
  const dir = mkdtempSync(join(tmpdir(), "ssg-scaffold-test-"));
  tempDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
});

test("slugify normalizes arbitrary names to kebab case", () => {
  assert.equal(slugify("My Game"), "my-game");
  assert.equal(slugify("  Café  Crawler!! "), "cafe-crawler");
  assert.equal(slugify("ALREADY-kebab"), "already-kebab");
  assert.equal(slugify("multi   space__name"), "multi-space-name");
  assert.equal(slugify("123 Go"), "123-go");
});

test("parseScaffoldArgs reads target dir, flags, and defaults", () => {
  const parsed = parseScaffoldArgs(["../my-game", "--name", "My Game", "--genre", "Survivors"]);
  assert.equal(parsed.targetDir, "../my-game");
  assert.equal(parsed.name, "My Game");
  assert.equal(parsed.genre, "survivors");
  assert.equal(parsed.loreUrl, DEFAULT_LORE_URL);
  assert.equal(parsed.lorePath, DEFAULT_LORE_PATH);
  assert.equal(parsed.submodule, true);
  assert.equal(parsed.git, true);
  assert.equal(parsed.force, false);
  assert.equal(parsed.dryRun, false);
  assert.deepEqual(parsed.errors, []);
});

test("parseScaffoldArgs honors negation and lore overrides", () => {
  const parsed = parseScaffoldArgs([
    "game",
    "--no-submodule",
    "--no-git",
    "--force",
    "--dry-run",
    "--lore-url",
    "https://example.com/lore.git",
    "--lore-path",
    "vendor/lore",
  ]);
  assert.equal(parsed.submodule, false);
  assert.equal(parsed.git, false);
  assert.equal(parsed.force, true);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.loreUrl, "https://example.com/lore.git");
  assert.equal(parsed.lorePath, "vendor/lore");
  assert.deepEqual(parsed.errors, []);
});

test("parseScaffoldArgs reports missing target and unknown flags", () => {
  const missing = parseScaffoldArgs([]);
  assert.ok(missing.errors.some((e) => e.includes("missing target")));

  const unknown = parseScaffoldArgs(["game", "--bogus"]);
  assert.ok(unknown.errors.some((e) => e.includes("unknown flag")));

  const noValue = parseScaffoldArgs(["game", "--name"]);
  assert.ok(noValue.errors.some((e) => e.includes("missing value")));
});

test("parseScaffoldArgs detects --help before requiring a target", () => {
  const parsed = parseScaffoldArgs(["--help"]);
  assert.equal(parsed.help, true);
  assert.deepEqual(parsed.errors, []);
});

test("renderTemplate substitutes known tokens and leaves unknown ones intact", () => {
  const rendered = renderTemplate("{{PROJECT_NAME}} is a {{GENRE_TITLE}} game ({{UNKNOWN}})", {
    PROJECT_NAME: "Test Game",
    GENRE_TITLE: "Survivors",
  });
  assert.equal(rendered, "Test Game is a Survivors game ({{UNKNOWN}})");
});

test("buildVars derives slug, title case, and engine package", () => {
  const vars = buildVars({
    name: "My Game",
    slug: "my-game",
    genre: "survivors",
    loreUrl: "https://lore",
    lorePath: ".lore",
    date: "2026-06-15",
  });
  assert.equal(vars.PROJECT_NAME, "My Game");
  assert.equal(vars.PROJECT_SLUG, "my-game");
  assert.equal(vars.GENRE, "survivors");
  assert.equal(vars.GENRE_TITLE, "Survivors");
  assert.equal(vars.ENGINE_PACKAGE, "@shipshitgames/engine");
  assert.equal(vars.DATE, "2026-06-15");
});

test("gitmodulesContent renders a valid submodule stanza", () => {
  const content = gitmodulesContent(".lore", "https://example.com/lore.git");
  assert.match(content, /\[submodule "\.lore"\]/);
  assert.match(content, /path = \.lore/);
  assert.match(content, /url = https:\/\/example\.com\/lore\.git/);
});

test("assertSafeLorePath rejects traversal, absolute paths, and control chars", () => {
  // Valid relative paths pass.
  assert.doesNotThrow(() => assertSafeLorePath(".lore"));
  assert.doesNotThrow(() => assertSafeLorePath("vendor/lore"));
  // Empty / non-string.
  assert.throws(() => assertSafeLorePath(""), /non-empty/);
  assert.throws(() => assertSafeLorePath(/** @type {any} */ (undefined)), /non-empty/);
  // Traversal.
  assert.throws(() => assertSafeLorePath("../escape"), /traverse/);
  assert.throws(() => assertSafeLorePath("nested/../../escape"), /traverse/);
  // Absolute (POSIX + Windows drive).
  assert.throws(() => assertSafeLorePath("/etc/lore"), /relative/);
  assert.throws(() => assertSafeLorePath("C:\\lore"), /relative/);
  // Injection via newline/control chars.
  assert.throws(() => assertSafeLorePath(".lore\n\turl = evil"), /control/);
});

test("assertSafeLoreUrl rejects empty and control-char URLs", () => {
  assert.doesNotThrow(() => assertSafeLoreUrl("https://example.com/lore.git"));
  assert.doesNotThrow(() => assertSafeLoreUrl("git@github.com:org/lore.git"));
  assert.throws(() => assertSafeLoreUrl(""), /non-empty/);
  assert.throws(() => assertSafeLoreUrl("https://x\n[submodule \"evil\"]"), /control/);
});

test("gitmodulesContent refuses to render an unsafe path or url", () => {
  assert.throws(() => gitmodulesContent("../escape", DEFAULT_LORE_URL), /traverse/);
  assert.throws(() => gitmodulesContent(DEFAULT_LORE_PATH, "https://x\nevil"), /control/);
});

test("symlinkPlan wires .claude and .codex memory + skills into .agents", () => {
  const links = symlinkPlan();
  const byLink = new Map(links.map((l) => [l.link, l.target]));
  assert.equal(byLink.get(".claude/skills"), "../.agents/skills");
  assert.equal(byLink.get(".claude/memory"), "../.agents/memory");
  assert.equal(byLink.get(".codex/skills"), "../.agents/skills");
  assert.equal(byLink.get(".codex/memory"), "../.agents/memory");
});

test("buildPlan maps template prefixes, genre dir, gitkeeps, symlinks, and gitmodules", () => {
  const plan = buildPlan({
    templateFiles: [
      "AGENTS.md.tmpl",
      "gitignore.tmpl",
      "dot-agents/memory/MEMORY.md.tmpl",
      "dot-agents/skills/worktree/scripts/create-worktree.sh",
      "dot-codex/instructions.md.tmpl",
    ],
    genreFiles: ["SKILL.md.tmpl", "plugin.json.tmpl"],
    options: { genre: "survivors", submodule: true, lorePath: ".lore", loreUrl: "u" },
  });
  const byPath = new Map(plan.map((p) => [p.path, p]));

  assert.ok(byPath.has("AGENTS.md"));
  assert.ok(byPath.has(".gitignore"));
  assert.ok(byPath.has(".agents/memory/MEMORY.md"));
  assert.ok(byPath.has(".codex/instructions.md"));

  const worktreeScript = byPath.get(".agents/skills/worktree/scripts/create-worktree.sh");
  assert.ok(worktreeScript);
  assert.equal(worktreeScript?.executable, true);

  assert.ok(byPath.has(".agents/skills/survivors/SKILL.md"));
  assert.ok(byPath.has(".agents/skills/survivors/plugin.json"));

  assert.ok(byPath.has(".agents/SYSTEM/.gitkeep"));
  assert.ok(byPath.has(".agents/SESSIONS/.gitkeep"));

  const skillsLink = byPath.get(".claude/skills");
  assert.equal(skillsLink?.kind, "symlink");
  assert.ok(byPath.has(".gitmodules"));
});

test("buildPlan omits .gitmodules when submodule is disabled", () => {
  const plan = buildPlan({
    templateFiles: ["AGENTS.md.tmpl"],
    genreFiles: [],
    options: { genre: "action", submodule: false, lorePath: ".lore", loreUrl: "u" },
  });
  assert.ok(!plan.some((p) => p.path === ".gitmodules"));
});

test("scaffold (dry-run) lists planned paths without writing", () => {
  const dir = join(makeTemp(), "game");
  const result = scaffold({
    targetDir: dir,
    name: "Dry Game",
    genre: "shooter",
    dryRun: true,
    lastVerified: "2026-06-15",
  });
  assert.equal(result.dryRun, true);
  assert.ok(result.created.includes("AGENTS.md"));
  assert.ok(result.created.includes(".agents/skills/shooter/SKILL.md"));
  assert.ok(!existsSync(dir));
});

test("scaffold stamps the full tree, symlinks, gitmodules, and git repo", () => {
  const dir = join(makeTemp(), "real-game");
  const result = scaffold({
    targetDir: dir,
    name: "Real Game",
    genre: "survivors",
    lastVerified: "2026-06-15",
  });

  assert.equal(result.name, "Real Game");
  assert.equal(result.genre, "survivors");
  assert.equal(result.submoduleDeclared, true);

  // root + entry points
  assert.ok(existsSync(join(dir, "AGENTS.md")));
  assert.ok(existsSync(join(dir, ".gitignore")));
  assert.ok(existsSync(join(dir, ".codex/instructions.md")));

  // memory seed references the two boundary docs AGENTS.md must point at
  const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.ok(agents.includes(".agents/memory/MEMORY.md"));
  assert.ok(agents.includes(".agents/memory/repo-boundary.md"));
  assert.ok(!agents.includes("{{"), "AGENTS.md still has unrendered tokens");

  // curated skills + genre skill
  for (const skill of [
    "session-start",
    "session-end",
    "worktree",
    "shipshit-engine",
    "vibe-game-workflow",
    "survivors",
  ]) {
    assert.ok(existsSync(join(dir, ".agents/skills", skill, "SKILL.md")), `missing skill ${skill}`);
    assert.ok(
      existsSync(join(dir, ".agents/skills", skill, "plugin.json")),
      `missing plugin.json for ${skill}`,
    );
  }

  // templated skills must be fully rendered (no leaked {{TOKEN}} seams)
  for (const skill of ["shipshit-engine", "vibe-game-workflow", "survivors"]) {
    const text = readFileSync(join(dir, ".agents/skills", skill, "SKILL.md"), "utf8");
    assert.ok(!text.includes("{{"), `${skill} SKILL.md has unrendered tokens`);
  }

  // worktree helper is executable
  const script = join(dir, ".agents/skills/worktree/scripts/create-worktree.sh");
  assert.ok(existsSync(script));
  assert.notEqual(statSync(script).mode & 0o111, 0, "worktree script not executable");

  // seed dirs kept
  assert.ok(existsSync(join(dir, ".agents/SYSTEM/.gitkeep")));
  assert.ok(existsSync(join(dir, ".agents/SESSIONS/.gitkeep")));

  // symlinks resolve into .agents
  for (const link of [".claude/skills", ".claude/memory", ".codex/skills", ".codex/memory"]) {
    const linkPath = join(dir, link);
    assert.ok(lstatSync(linkPath).isSymbolicLink(), `${link} is not a symlink`);
    const resolved = resolve(dirname(linkPath), readlinkSync(linkPath));
    assert.ok(existsSync(resolved), `${link} dangles`);
  }

  // lore submodule declared, git initialized
  const gitmodules = readFileSync(join(dir, ".gitmodules"), "utf8");
  assert.match(gitmodules, /\[submodule "\.lore"\]/);
  assert.equal(result.gitInitialized, true);
  assert.ok(existsSync(join(dir, ".git")));

  // genre skill rendered with the genre name
  const genreSkill = readFileSync(join(dir, ".agents/skills/survivors/SKILL.md"), "utf8");
  assert.ok(genreSkill.includes("Survivors"));
  assert.ok(!genreSkill.includes("{{"));
});

test("scaffold refuses a non-empty target without --force", () => {
  const dir = join(makeTemp(), "occupied");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "keep.txt"), "hi");
  assert.throws(
    () => scaffold({ targetDir: dir, name: "X", lastVerified: "2026-06-15" }),
    /not empty/,
  );
});

test("scaffold --force stamps into a non-empty directory and preserves existing files", () => {
  const dir = join(makeTemp(), "occupied-force");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "keep.txt"), "hi");
  const result = scaffold({
    targetDir: dir,
    name: "Forced Game",
    genre: "rpg",
    git: false,
    force: true,
    lastVerified: "2026-06-15",
  });
  // The user's pre-existing file is untouched and uncounted.
  assert.equal(readFileSync(join(dir, "keep.txt"), "utf8"), "hi");
  assert.ok(!result.created.includes("keep.txt"));
  // The full tree still lands.
  assert.ok(existsSync(join(dir, "AGENTS.md")));
  assert.ok(existsSync(join(dir, ".agents/skills/rpg/SKILL.md")));
  for (const link of [".claude/skills", ".codex/memory"]) {
    assert.ok(lstatSync(join(dir, link)).isSymbolicLink(), `${link} not a symlink`);
  }
});

test("scaffold --force replaces a broken symlink and counts it once", () => {
  const dir = join(makeTemp(), "broken-link");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  // Plant a dangling symlink where the scaffolder wants to write one.
  symlinkSync("../does-not-exist", join(dir, ".claude/skills"));
  const result = scaffold({
    targetDir: dir,
    name: "Relink Game",
    git: false,
    force: true,
    lastVerified: "2026-06-15",
  });
  const linkPath = join(dir, ".claude/skills");
  assert.ok(lstatSync(linkPath).isSymbolicLink());
  const resolved = resolve(dirname(linkPath), readlinkSync(linkPath));
  assert.ok(existsSync(resolved), "relinked .claude/skills still dangles");
  // It was (re)created exactly once.
  assert.equal(result.created.filter((p) => p === ".claude/skills").length, 1);
});

test("scaffold can skip the submodule and git init", () => {
  const dir = join(makeTemp(), "bare");
  const result = scaffold({
    targetDir: dir,
    name: "Bare Game",
    genre: "puzzle",
    submodule: false,
    git: false,
    lastVerified: "2026-06-15",
  });
  assert.equal(result.submoduleDeclared, false);
  assert.equal(result.gitInitialized, false);
  assert.ok(!existsSync(join(dir, ".gitmodules")));
  assert.ok(!existsSync(join(dir, ".git")));
});

test("scaffold defaults genre and name from the target dir", () => {
  const base = makeTemp();
  const dir = join(base, "my-cool-game");
  const result = scaffold({ targetDir: dir, git: false, lastVerified: "2026-06-15" });
  assert.equal(result.name, "my-cool-game");
  assert.equal(result.genre, DEFAULT_GENRE);
  assert.ok(existsSync(join(dir, ".agents/skills", DEFAULT_GENRE, "SKILL.md")));
});

// Spawning the real CLI binary is covered end-to-end in e2e/scaffold.e2e.test.js;
// this guard just proves the package's bin entry resolves and runs.
test("cli --version runs", () => {
  const cliPath = resolve(dirname(new URL(import.meta.url).pathname), "../src/cli.js");
  const run = spawnSync(process.execPath, [cliPath, "--version"], { encoding: "utf8" });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /\d+\.\d+\.\d+/);
});
