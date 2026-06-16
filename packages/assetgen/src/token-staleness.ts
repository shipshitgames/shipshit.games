// Vendored-token staleness gate (#47).
//
// `assetgen tokens` stamps every generated/synced token artifact with a banner
// that carries the canon DESIGN.md version, e.g.
//   /* GENERATED FROM lore/DESIGN.md v0.1.0 hash:73277f2a - DO NOT EDIT. ... */
//   /* GENERATED FROM DESIGN.md v0.1.0 for app token consumers. ... */
//
// Inside the monorepo, a full byte-drift check (`assetgen tokens --check`)
// catches rot by regenerating from DESIGN.md and comparing. But the SEPARATE
// game repos VENDOR the token files in without DESIGN.md or assetgen present,
// so they cannot regenerate. This module is the no-npm equivalent of an
// installed-version check: it reads the banner version out of each vendored
// file and fails when it is behind the canon version, so a stale vendored copy
// cannot survive a build (wire it into the game's `prebuild`).
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDesignPath } from "./tokens.ts";

const here = dirname(fileURLToPath(import.meta.url)); // packages/assetgen/src
const ROOT = join(here, "..", "..", ".."); // monorepo root

/**
 * Vendored consumers checked in the monorepo when no files are passed. These are
 * the hand-synced app token forks that can rot independently of the generator
 * (the `packages/assets/tokens/*` artifacts are already byte-checked by
 * `assetgen tokens --check`). Paths are repo-relative.
 */
export const DEFAULT_CONSUMER_FILES = [
  "apps/web/app/theme.css",
  "apps/desktop/src/renderer/tokens.css",
] as const;

/** A `[major, minor, patch]` semver core. */
export type Semver = [number, number, number];

export type StalenessStatus = "current" | "ahead" | "stale" | "missing" | "no-banner";

export interface ConsumerResult {
  /** Repo-relative path when under the monorepo root, else the path as given. */
  file: string;
  status: StalenessStatus;
  /** The banner version, or null when missing/unparseable. */
  version: string | null;
}

export interface StalenessReport {
  /** True when every consumer is `current` or `ahead` of canon. */
  ok: boolean;
  canonVersion: string;
  results: ConsumerResult[];
}

export interface CheckStalenessOptions {
  /** Files to check; relative paths resolve against the caller's cwd. Defaults to {@link DEFAULT_CONSUMER_FILES} resolved against the repo root. */
  files?: string[];
  /** Override the canon version (for a vendored repo that has no DESIGN.md to resolve). */
  canonVersion?: string;
  /** Path to DESIGN.md; resolved via the same search as `tokens` when omitted. */
  design?: string;
}

/** Parse a strict `MAJOR.MINOR.PATCH` semver core (ignoring any pre-release/build suffix). Null when unparseable. */
export function parseSemver(input: string): Semver | null {
  const m = input.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Compare two semver cores: -1 if a<b, 0 if equal, 1 if a>b. */
export function compareSemver(a: Semver, b: Semver): -1 | 0 | 1 {
  for (let i = 0; i < 3; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  return 0;
}

/** Extract the `vX.Y.Z` version stamped into a generated banner. Null when no banner version is present. */
export function parseBannerVersion(content: string): string | null {
  const m = content.match(/GENERATED FROM[^\n]*?\bv(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/);
  return m ? (m[1] ?? null) : null;
}

/** Read the canon version from a DESIGN.md document's YAML frontmatter. Mirrors `tokens.ts`. */
export function parseDesignVersion(designText: string): string {
  const fm = designText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm?.[1]) throw new Error("DESIGN.md has no YAML frontmatter");
  const parsed = (Bun as unknown as { YAML: { parse(input: string): unknown } }).YAML.parse(fm[1]) as
    | Record<string, unknown>
    | null;
  const version = parsed?.version;
  if (typeof version !== "string" || !parseSemver(version)) {
    throw new Error(`DESIGN.md frontmatter version is missing or not semver: ${String(version)}`);
  }
  return version;
}

/**
 * Classify each vendored token consumer against the canon DESIGN.md version.
 * `missing`, `no-banner`, and `stale` all fail the gate; `current`/`ahead` pass.
 */
export async function checkTokenStaleness(opts: CheckStalenessOptions = {}): Promise<StalenessReport> {
  const canonVersion =
    opts.canonVersion ?? parseDesignVersion(await readFile(resolveDesignPath(opts.design), "utf8"));
  const canon = parseSemver(canonVersion);
  if (!canon) throw new Error(`canon version is not valid semver: ${canonVersion}`);

  // Explicit file args are the caller's paths, so relative ones resolve against
  // the invoking repo's cwd (a vendored game repo wiring this into its prebuild).
  // The defaults are intrinsically monorepo paths, so they stay anchored to ROOT.
  const files =
    opts.files && opts.files.length > 0
      ? opts.files.map((f) => (isAbsolute(f) ? f : join(process.cwd(), f)))
      : DEFAULT_CONSUMER_FILES.map((f) => join(ROOT, f));

  const results: ConsumerResult[] = [];
  for (const file of files) {
    const rel = repoRelative(file);
    if (!existsSync(file)) {
      results.push({ file: rel, status: "missing", version: null });
      continue;
    }
    const banner = parseBannerVersion(await readFile(file, "utf8"));
    const parsed = banner ? parseSemver(banner) : null;
    if (!banner || !parsed) {
      results.push({ file: rel, status: "no-banner", version: banner });
      continue;
    }
    const cmp = compareSemver(parsed, canon);
    results.push({ file: rel, status: cmp < 0 ? "stale" : cmp > 0 ? "ahead" : "current", version: banner });
  }

  const ok = results.every((r) => r.status === "current" || r.status === "ahead");
  return { ok, canonVersion, results };
}

/** Files that fail the gate (everything that is not `current` or `ahead`). */
export function failingResults(report: StalenessReport): ConsumerResult[] {
  return report.results.filter((r) => r.status !== "current" && r.status !== "ahead");
}

function repoRelative(path: string): string {
  const rel = relative(ROOT, path);
  return rel.startsWith("..") ? path : rel;
}
