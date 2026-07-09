#!/usr/bin/env bun
/**
 * Publish the already-versioned public @shipshitgames packages.
 *
 * This script intentionally does not bump versions, rewrite consumers, create
 * branches, or deploy applications. Version changes must reach a green master
 * through review first. Production applications deploy only from semver GitHub
 * Releases through .github/workflows/deploy-production.yml.
 *
 * Dry-run is the default. Pass --execute to verify and publish.
 *
 * Flags:
 *   --execute            publish packages that are not already on npm
 *   --only=engine,ui     restrict the package short names
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const SCOPE = "@shipshitgames/";
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const only = args
  .find((arg) => arg.startsWith("--only="))
  ?.slice("--only=".length)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const colors = {
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  reset: "\x1b[0m",
  yellow: "\x1b[33m",
};

function fail(message) {
  console.error(`${colors.red}✗ ${message}${colors.reset}`);
  process.exit(1);
}

function validateArgs() {
  const unknown = args.filter(
    (arg) => arg !== "--execute" && !arg.startsWith("--only="),
  );
  if (unknown.length) fail(`unknown release option(s): ${unknown.join(", ")}`);
  if (args.filter((arg) => arg.startsWith("--only=")).length > 1) {
    fail("--only may be specified once");
  }
  if (args.some((arg) => arg === "--only=")) fail("--only requires at least one package name");
}

function step(message) {
  console.log(`\n${colors.cyan}━━ ${message}${colors.reset}`);
}

function run(command, commandArgs, options = {}) {
  try {
    return execFileSync(command, commandArgs, {
      cwd: options.cwd ?? REPO,
      encoding: "utf8",
      stdio: options.capture ? ["ignore", "pipe", "ignore"] : "inherit",
    })?.trim() ?? "";
  } catch (error) {
    if (options.allowFailure) return "";
    throw error;
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function listPackageDirs(parent) {
  if (!existsSync(parent)) return [];
  return readdirSync(parent)
    .map((name) => join(parent, name))
    .filter((path) => statSync(path).isDirectory() && existsSync(join(path, "package.json")));
}

function discoverPackages() {
  const candidates = [
    ...listPackageDirs(join(REPO, "apps")),
    ...listPackageDirs(join(REPO, "packages")),
  ];
  let packages = candidates
    .map((dir) => ({ dir, json: readJson(join(dir, "package.json")) }))
    .filter(({ json }) => json.private !== true && json.name?.startsWith(SCOPE));
  if (only) packages = packages.filter(({ json }) => only.includes(json.name.slice(SCOPE.length)));
  if (!packages.length) fail("no publishable packages matched");

  const byName = new Map(packages.map((entry) => [entry.json.name, entry]));
  const sorted = [];
  const visited = new Set();

  function visit(entry, stack = new Set()) {
    if (visited.has(entry.json.name)) return;
    if (stack.has(entry.json.name)) fail(`dependency cycle at ${entry.json.name}`);
    const nextStack = new Set(stack).add(entry.json.name);
    for (const field of DEPENDENCY_FIELDS) {
      for (const dependency of Object.keys(entry.json[field] ?? {})) {
        const local = byName.get(dependency);
        if (local) visit(local, nextStack);
      }
    }
    visited.add(entry.json.name);
    sorted.push(entry);
  }

  for (const entry of packages) visit(entry);
  return sorted;
}

function assertReleaseSource() {
  const branch = run("git", ["branch", "--show-current"], { capture: true });
  if (branch !== "master") fail(`package releases must run from master (current: ${branch || "detached"})`);
  if (run("git", ["status", "--porcelain"], { capture: true })) {
    fail("package releases require a clean working tree");
  }
  run("git", ["fetch", "--quiet", "origin", "master"]);
  const head = run("git", ["rev-parse", "HEAD"], { capture: true });
  const remote = run("git", ["rev-parse", "origin/master"], { capture: true });
  if (head !== remote) fail("master must exactly match origin/master before publishing");
}

validateArgs();

step("Discover publishable packages");
const packages = discoverPackages();
for (const { dir, json } of packages) {
  console.log(`  ${json.name}@${json.version} ${colors.dim}(${basename(dir)})${colors.reset}`);
}

if (!execute) {
  console.log(
    `\n${colors.yellow}[dry-run]${colors.reset} package plan only; no versions, repositories, deployments, or registry state changed.`,
  );
  process.exit(0);
}

step("Verify release source");
assertReleaseSource();
console.log(`  ${colors.green}✓${colors.reset} clean master matches origin/master`);

if (!run("bun", ["pm", "whoami"], { capture: true, allowFailure: true })) {
  fail("not logged in to npm (`bun pm whoami`)");
}

step("Resolve unpublished packages");
const pending = [];
for (const { dir, json } of packages) {
  const spec = `${json.name}@${json.version}`;
  const publishedVersion = run("bun", ["pm", "view", spec, "version"], {
    capture: true,
    allowFailure: true,
  });
  if (publishedVersion === json.version) {
    console.log(`  ${colors.dim}· ${spec} already published${colors.reset}`);
    continue;
  }

  pending.push({ dir, json, spec });
  console.log(`  ${colors.yellow}•${colors.reset} ${spec}`);
}

step("Preflight unpublished packages");
for (const { dir, json, spec } of pending) {

  if (json.scripts?.typecheck) run("bun", ["run", "typecheck"], { cwd: dir });
  if (json.scripts?.test) run("bun", ["run", "test"], { cwd: dir });
  if (json.scripts?.build && !json.scripts?.typecheck) run("bun", ["run", "build"], { cwd: dir });
  run("bun", ["pm", "pack", "--dry-run"], { cwd: dir });
  console.log(`  ${colors.green}✓${colors.reset} verified ${spec}`);
}

step("Publish packages");
for (const { dir, spec } of pending) {
  run("bun", ["publish", "--access", "public"], { cwd: dir });
  console.log(`  ${colors.green}✓${colors.reset} published ${spec}`);
}

if (!pending.length) console.log(`  ${colors.dim}· every selected version is already published${colors.reset}`);

console.log(
  `\n${colors.green}[complete]${colors.reset} packages published; create an explicit downstream dependency PR, then cut a semver GitHub Release when application deployment is intended.`,
);
