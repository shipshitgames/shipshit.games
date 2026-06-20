#!/usr/bin/env bun
/**
 * release-tag.mjs — stamp a production release marker tag.
 *
 * This is NOT the deployer. Production is deployed by
 * .github/workflows/deploy-production.yml, which fires on a published GitHub
 * Release whose tag is semver `v*` (Vercel's master git auto-deploy is disabled
 * in vercel.json). This script instead records WHAT IS IN PROD as an annotated
 * git tag pointing at a specific commit — an immutable, auditable `prod-*`
 * marker on the trunk, not a long-lived `master`-vs-prod branch distinction.
 *
 * Because `prod-*` marker tags are DEPLOY-NEUTRAL, no GitHub Release is created
 * by default — a marker must never trip the workflow's `release: published` v*
 * deploy gate. Pass --release only when you deliberately want a Release too.
 *
 * SAFETY: DRY RUN by default — prints the plan and creates/pushes nothing; a
 * read-only `git fetch` refreshes origin/master unless --no-fetch is passed.
 * Pass --execute to create + push the tag.
 *
 *   Flags:
 *     --execute          actually create + push the tag
 *     --sha=<commit>     commit to mark (default: origin/master HEAD)
 *     --tag=<name>       tag name (default: prod-YYYY-MM-DD, deduped with .N)
 *     --message=<text>   annotation / release-note body (default: auto)
 *     --release          also `gh release create` (off by default; deploy-neutral)
 *     --no-fetch         don't `git fetch` before resolving origin/master
 *
 * NOTE: By default this marks `origin/master` HEAD. Pass --sha to mark an exact
 * deployed commit (copy the SHA from the release/deploy run or Vercel dashboard).
 *
 * Auth for --execute: push access (tag push); also `gh auth status` if --release.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const EXECUTE = has("--execute");
const DRY = !EXECUTE;
const DO_RELEASE = has("--release");
const DO_FETCH = !has("--no-fetch");

const C = { dim: "\x1b[2m", red: "\x1b[31m", grn: "\x1b[32m", yel: "\x1b[33m", cyn: "\x1b[36m", rst: "\x1b[0m" };
const tag = DRY ? `${C.yel}[dry-run]${C.rst}` : `${C.grn}[execute]${C.rst}`;
const log = (...a) => console.log(...a);
const step = (s) => log(`\n${C.cyn}━━ ${s}${C.rst}`);
const plan = (...a) => log(`  ${C.yel}plan${C.rst}`, ...a);
const done = (...a) => log(`  ${C.grn}✓${C.rst}`, ...a);
const die = (m) => { console.error(`${C.red}✗ ${m}${C.rst}`); process.exit(1); };

/** Run a command. Read-only commands always run; mutating ones are skipped (printed) in dry-run. */
function run(cmd, { mutating = false, capture = false } = {}) {
  if (mutating && DRY) { plan(`${C.dim}${cmd}${C.rst}`); return ""; }
  try {
    return execSync(cmd, { stdio: capture ? ["ignore", "pipe", "ignore"] : "inherit", encoding: "utf8" })?.trim() ?? "";
  } catch (e) {
    if (capture) return "";
    throw e;
  }
}

// ── 1. resolve the commit to mark ───────────────────────────────────────────
step("Resolve production commit");
if (DO_FETCH) run("git fetch --quiet --tags origin master", { capture: true });
const ref = val("sha") || "origin/master";
const sha = run(`git rev-parse ${ref}`, { capture: true });
if (!sha) die(`could not resolve ${ref} (try --no-fetch, or a reachable --sha=)`);
const shortSha = sha.slice(0, 9);
const subject = run(`git log -1 --format=%s ${sha}`, { capture: true });
const isoDate = new Date().toISOString();
const day = isoDate.slice(0, 10);
log(`  ${C.dim}commit${C.rst} ${shortSha}  ${C.dim}${subject}${C.rst}`);

// ── 2. choose a unique tag name ─────────────────────────────────────────────
step("Choose tag name");
const existing = new Set(run("git tag --list", { capture: true }).split("\n").filter(Boolean));
let tagName = val("tag");
if (tagName) {
  if (existing.has(tagName)) die(`tag ${tagName} already exists`);
} else {
  const base = `prod-${day}`;
  tagName = base;
  for (let n = 2; existing.has(tagName); n++) tagName = `${base}.${n}`;
}
log(`  ${C.dim}tag${C.rst}    ${tagName}`);

// ── 3. compose the annotation / release notes ───────────────────────────────
// Pass the (multi-line) message via a file: shell double-quoting would turn
// embedded newlines into literal "\n", so -F / --notes-file is the safe path.
const message = val("message") || `Production release ${tagName}\n\nDeployed commit: ${sha}\n${subject}\nMarked: ${isoDate}`;
const notesFile = join(tmpdir(), `release-tag-${tagName}.txt`);
log(`  ${C.dim}notes${C.rst}`);
for (const line of message.split("\n")) log(`    ${C.dim}${line}${C.rst}`);

// ── 4. create + push the tag, and (optionally) a GitHub release ─────────────
step("Create marker");
if (!DRY) writeFileSync(notesFile, `${message}\n`);
run(`git tag -a ${tagName} ${sha} -F ${JSON.stringify(notesFile)}`, { mutating: true });
run(`git push origin ${tagName}`, { mutating: true });
done(`tag ${tagName} -> ${shortSha}`);

if (DO_RELEASE) {
  run(`gh release create ${tagName} --target ${sha} --title ${JSON.stringify(tagName)} --notes-file ${JSON.stringify(notesFile)}`, { mutating: true });
  done(`GitHub release ${tagName}`);
}

log(`\n${tag} ${DRY ? "plan only — re-run with --execute to create + push the tag." : `marked ${shortSha} as ${tagName}.`}`);
