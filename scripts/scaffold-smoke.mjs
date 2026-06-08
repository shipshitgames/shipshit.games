import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = mkdtempSync(join(tmpdir(), "shipshit-scaffold-"));
const stampedRepo = join(smokeRoot, "repo");

const requiredFiles = [
  "AGENTS.md",
  ".agents/memory/MEMORY.md",
  ".agents/memory/repo-boundary.md",
  ".agents/skills/session-start/SKILL.md",
  ".agents/skills/session-end/SKILL.md",
  ".agents/skills/worktree/SKILL.md",
  ".agents/skills/worktree/scripts/create-worktree.sh",
];

const fail = (message) => {
  throw new Error(`scaffold smoke: ${message}`);
};

const assertExists = (relativePath) => {
  const fullPath = join(stampedRepo, relativePath);
  if (!existsSync(fullPath)) fail(`missing ${relativePath}`);
  return fullPath;
};

const walk = (dir, visit) => {
  for (const entry of readdirSync(dir).sort()) {
    const fullPath = join(dir, entry);
    visit(fullPath);
    if (lstatSync(fullPath).isDirectory()) walk(fullPath, visit);
  }
};

try {
  mkdirSync(stampedRepo, { recursive: true });
  const gitInit = spawnSync("git", ["init", "--quiet"], { cwd: stampedRepo, stdio: "ignore" });
  if (gitInit.status !== 0) fail("could not initialize throwaway git repo");

  cpSync(join(repoRoot, "AGENTS.md"), join(stampedRepo, "AGENTS.md"), { recursive: true });
  cpSync(join(repoRoot, ".agents"), join(stampedRepo, ".agents"), {
    dereference: false,
    recursive: true,
  });

  for (const relativePath of requiredFiles) assertExists(relativePath);

  const agentsInstructions = readFileSync(assertExists("AGENTS.md"), "utf8");
  for (const memoryPath of [".agents/memory/MEMORY.md", ".agents/memory/repo-boundary.md"]) {
    if (!agentsInstructions.includes(memoryPath)) {
      fail(`AGENTS.md does not reference ${memoryPath}`);
    }
  }

  const worktreeScript = assertExists(".agents/skills/worktree/scripts/create-worktree.sh");
  if ((statSync(worktreeScript).mode & 0o111) === 0) {
    fail(`${basename(worktreeScript)} is not executable`);
  }

  const symlinks = [];
  walk(join(stampedRepo, ".agents"), (fullPath) => {
    const stat = lstatSync(fullPath);
    if (stat.isSymbolicLink()) symlinks.push(fullPath);
  });

  for (const symlinkPath of symlinks) {
    const resolved = resolve(dirname(symlinkPath), readlinkSync(symlinkPath));
    if (!existsSync(resolved)) fail(`broken symlink ${symlinkPath}`);
  }

  const gitmodulesPath = join(repoRoot, ".gitmodules");
  if (existsSync(gitmodulesPath)) {
    const gitmodules = readFileSync(gitmodulesPath, "utf8");
    const agentSubmodules = [...gitmodules.matchAll(/path\s*=\s*(\.agents\/[^\n]+)/g)].map((match) => match[1]);
    for (const submodulePath of agentSubmodules) assertExists(submodulePath);
  }

  console.log(`scaffold smoke passed: ${stampedRepo}`);
} finally {
  rmSync(smokeRoot, { force: true, recursive: true });
}
