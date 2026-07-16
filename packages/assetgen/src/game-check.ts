// Per-game asset-integrity gate (#52).
//
// `assetgen check --game <slug>` is the legal/asset guarantee a game repo wires
// into its `prebuild`: it proves, against the game's committed `src/assets`
// tree, that
//   1. every manifest entry's files resolve on disk (no dangling references),
//   2. no orphan webps sit in the tree unreferenced by the manifest,
//   3. the generated `assets.generated.ts` is current (opt-in; needs the shared
//      @shipshitgames/assets package, so it auto-skips in a vendored repo),
//   4. every entry carries a complete license record, and
//   5. no entry is sourced from a banned generator (Udio).
// Together with the loader throwing on a missing/unlicensed asset at runtime,
// this gives a build-time legal guarantee with zero CI infrastructure.
//
// This module is the pure core: it reads the filesystem and returns a report.
// It never prints or exits — `commands/check.ts` owns presentation and exit
// codes so the same report can drive `--json`, a prebuild hook, or a test.
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

import { buildAssetIndex, isPackedPageImage } from "./asset-index.ts";
import { buildCodegenModule, type AtlasMapJson } from "./codegen.ts";
import { type AssetEntry, missingLicenseFields } from "./manifest.ts";

/**
 * Generators denied by policy. Udio (#52) is rejected because its output cannot
 * carry the provenance/licensing the studio requires. Matched case-insensitively
 * against whole tokens so a legitimate value like "studio" never trips on it.
 */
export const BANNED_SOURCES = ["udio"] as const;

const BANNED_SET = new Set<string>(BANNED_SOURCES);

/** The fields an entry may name a generator/provider in, scanned for banned sources. */
const PROVIDER_FIELDS = ["provider", "model"] as const;

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".turbo", "sources"]);

export type GameCheckName =
  | "manifest-resolves"
  | "orphan-webps"
  | "licensed"
  | "banned-source"
  | "codegen-current";

export type GameCheckStatus = "ok" | "fail" | "skipped";

export interface GameCheckResult {
  check: GameCheckName;
  status: GameCheckStatus;
  /** One human line per failure (the offending entry/path and why). */
  messages: string[];
  /** One-line summary for the human/`--json` report. */
  summary: string;
}

export interface GameCheckReport {
  /** True when no check failed (`skipped` does not fail the gate). */
  ok: boolean;
  game: string;
  /** Resolved manifest path that was read. */
  manifest: string;
  /** Resolved assets root (the manifest's directory); entry paths are relative to it. */
  assetsRoot: string;
  results: GameCheckResult[];
}

export interface GameCheckOptions {
  game: string;
  /** Assets root holding the manifest + asset tree (entry paths are relative to it). */
  assetsRoot: string;
  /** Manifest file to read; defaults to `<assetsRoot>/assets.json`. */
  manifest?: string;
  /** Generated module to staleness-check; defaults to `<assetsRoot>/../assets.generated.ts`. */
  generatedPath?: string;
  /** Shared @shipshitgames/assets dir the generated module derives from. Absent ⇒ codegen check skips. */
  assetsDir?: string;
  /** Skip the codegen-current check entirely (e.g. a repo that does not vendor a generated module). */
  skipCodegen?: boolean;
}

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

/** True when any whole `[a-z0-9]+` token of `value` is a banned source. */
export function isBannedSource(value: unknown): boolean {
  if (typeof value !== "string" || !value) return false;
  for (const token of value.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token && BANNED_SET.has(token)) return true;
  }
  return false;
}

/** The file-reference fields an entry can carry, all relative to the assets root. */
function entryFileRefs(entry: AssetEntry): { field: string; value: string }[] {
  const refs: { field: string; value: string }[] = [];
  if (typeof entry.path === "string" && entry.path) refs.push({ field: "path", value: entry.path });
  if (typeof entry.animation === "string" && entry.animation) refs.push({ field: "animation", value: entry.animation });
  if (typeof entry.preview === "string" && entry.preview) refs.push({ field: "preview", value: entry.preview });
  if (typeof entry.modelTrace?.source === "string" && entry.modelTrace.source) {
    refs.push({ field: "modelTrace.source", value: entry.modelTrace.source });
  }
  if (typeof entry.modelTrace?.report === "string" && entry.modelTrace.report) {
    refs.push({ field: "modelTrace.report", value: entry.modelTrace.report });
  }
  return refs;
}

function entryLabel(entry: AssetEntry, index: number): string {
  const id = typeof entry.id === "string" && entry.id ? entry.id : `#${index}`;
  const kind = typeof entry.kind === "string" && entry.kind ? entry.kind : "?";
  return `${id}:${kind}`;
}

/** Recursively collect every `.webp` under `dir` as a posix path relative to `assetsRoot`, skipping packed pages. */
async function walkWebps(dir: string, assetsRoot: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // a missing assets tree is reported by the manifest check, not here
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkWebps(full, assetsRoot, out);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".webp" && !isPackedPageImage(entry.name)) {
      out.push(toPosix(relative(assetsRoot, full)));
    }
  }
}

function ok(check: GameCheckName, summary: string): GameCheckResult {
  return { check, status: "ok", messages: [], summary };
}
function fail(check: GameCheckName, summary: string, messages: string[]): GameCheckResult {
  return { check, status: "fail", messages, summary };
}
function skipped(check: GameCheckName, summary: string): GameCheckResult {
  return { check, status: "skipped", messages: [], summary };
}

/**
 * Run every per-game integrity check and return a structured report. The caller
 * owns printing + the exit code; this function only reads the filesystem.
 */
export async function runGameCheck(opts: GameCheckOptions): Promise<GameCheckReport> {
  const { game, assetsRoot } = opts;
  const manifest = opts.manifest ?? join(assetsRoot, "assets.json");
  const results: GameCheckResult[] = [];

  // The manifest is the source of truth for every other check; a missing or
  // malformed one is a hard failure, not a skip.
  let entries: AssetEntry[] | null = null;
  let manifestError: string | null = null;
  if (!existsSync(manifest)) {
    manifestError = `no manifest at ${manifest} — register assets or pass --manifest`;
  } else {
    try {
      const parsed = JSON.parse(await readFile(manifest, "utf8")) as { assets?: unknown };
      if (!Array.isArray(parsed.assets)) {
        manifestError = `manifest ${manifest} has no "assets" array`;
      } else {
        entries = parsed.assets as AssetEntry[];
      }
    } catch (err) {
      manifestError = `manifest ${manifest} is not valid JSON: ${(err as Error).message}`;
    }
  }

  if (entries === null) {
    // Every check folds into the same manifest failure so the report is coherent.
    const msg = [manifestError ?? "manifest unavailable"];
    for (const check of ["manifest-resolves", "orphan-webps", "licensed", "banned-source"] as const) {
      results.push(fail(check, "manifest unavailable", msg));
    }
    if (!opts.skipCodegen) results.push(skipped("codegen-current", "manifest unavailable"));
    return { ok: false, game, manifest, assetsRoot, results };
  }

  // 1. Every file a manifest entry references resolves on disk.
  const missing: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    for (const ref of entryFileRefs(entry)) {
      if (!existsSync(join(assetsRoot, ref.value))) {
        missing.push(`${entryLabel(entry, i)} → ${ref.field} "${ref.value}" not found`);
      }
    }
  }
  results.push(
    missing.length > 0
      ? fail("manifest-resolves", `${missing.length} unresolved reference(s)`, missing)
      : ok("manifest-resolves", `${entries.length} ${entries.length === 1 ? "entry resolves" : "entries resolve"} on disk`),
  );

  // 2. No orphan webps: every webp on disk is referenced by the manifest (packed
  //    atlas/anim pages are derived build output and are not counted).
  const referenced = new Set<string>();
  for (const entry of entries) {
    // Canonicalize each reference to the same key shape walkWebps emits for disk
    // files (`relative(assetsRoot, full)`), so a non-canonical manifest path like
    // "./sprites/x.webp" still matches the real file and is not a false orphan.
    for (const ref of entryFileRefs(entry)) referenced.add(toPosix(relative(assetsRoot, join(assetsRoot, ref.value))));
  }
  const diskWebps: string[] = [];
  await walkWebps(assetsRoot, assetsRoot, diskWebps);
  const orphans = diskWebps.filter((w) => !referenced.has(w)).sort();
  results.push(
    orphans.length > 0
      ? fail("orphan-webps", `${orphans.length} orphan webp(s)`, orphans.map((o) => `${o} is not referenced by the manifest`))
      : ok("orphan-webps", `no orphan webps (${diskWebps.length} referenced)`),
  );

  // 3. Every entry carries a complete license record.
  const unlicensed: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const missingFields = missingLicenseFields(entry);
    if (missingFields.length > 0) {
      unlicensed.push(`${entryLabel(entry, i)} missing license.${missingFields.join(", license.")}`);
    }
  }
  results.push(
    unlicensed.length > 0
      ? fail("licensed", `${unlicensed.length} unlicensed entr${unlicensed.length === 1 ? "y" : "ies"}`, unlicensed)
      : ok("licensed", `all ${entries.length} entr${entries.length === 1 ? "y is" : "ies are"} licensed`),
  );

  // 4. No banned generator (Udio) in any provider/license field.
  const banned: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const fields: { field: string; value: unknown }[] = [
      ...PROVIDER_FIELDS.map((f) => ({ field: f, value: entry[f] })),
      { field: "license.tool", value: entry.license?.tool },
      { field: "license.plan", value: entry.license?.plan },
      { field: "provenance.provider", value: entry.provenance?.provider },
    ];
    for (const { field, value } of fields) {
      if (isBannedSource(value)) {
        banned.push(`${entryLabel(entry, i)} ${field}="${value}" is a banned source`);
      }
    }
  }
  results.push(
    banned.length > 0
      ? fail("banned-source", `${banned.length} banned-source reference(s)`, banned)
      : ok("banned-source", `no banned sources (${BANNED_SOURCES.join(", ")})`),
  );

  // 5. The generated module is current (opt-in: needs the shared assets package).
  if (!opts.skipCodegen) {
    results.push(await checkCodegenCurrent(opts));
  }

  return { ok: results.every((r) => r.status !== "fail"), game, manifest, assetsRoot, results };
}

/**
 * Compare the committed `assets.generated.ts` against a freshly built module.
 * Auto-skips (does not fail) when the shared @shipshitgames/assets package is
 * absent, since a vendored game repo cannot regenerate it.
 */
async function checkCodegenCurrent(opts: GameCheckOptions): Promise<GameCheckResult> {
  const check: GameCheckName = "codegen-current";
  const assetsDir = opts.assetsDir;
  const generatedPath = opts.generatedPath ?? join(opts.assetsRoot, "..", "assets.generated.ts");

  if (!assetsDir || !existsSync(join(assetsDir, "assets-catalog.json"))) {
    return skipped(check, `shared assets package not found${assetsDir ? ` at ${assetsDir}` : ""} — pass --assets-dir to enable`);
  }
  if (!existsSync(generatedPath)) {
    return fail(check, "generated module missing", [
      `no generated module at ${generatedPath} — run \`assetgen codegen --game ${opts.game}\``,
    ]);
  }

  const index = await buildAssetIndex({ assetsDir, game: opts.game });
  const atlasPath = join(assetsDir, `${opts.game}.atlas.json`);
  const atlas = existsSync(atlasPath) ? (JSON.parse(await readFile(atlasPath, "utf8")) as AtlasMapJson) : null;
  const expected = buildCodegenModule(index, atlas, opts.game);

  if ((await readFile(generatedPath, "utf8")) !== expected) {
    return fail(check, "generated module out of date", [
      `${generatedPath} is out of date — re-run \`assetgen codegen --game ${opts.game}\``,
    ]);
  }
  return ok(check, `generated module current (${index.assetCount} assets)`);
}
