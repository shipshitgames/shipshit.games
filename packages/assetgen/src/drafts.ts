import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { register } from "./manifest.ts";
import type { AssetEntry } from "./manifest.ts";

/**
 * Draft / promote split (issue #54).
 *
 * `generate --draft` stages a generated asset under `<assets>/drafts/` with its
 * own `drafts.json` manifest instead of writing the production `assets.json`.
 * `assetgen promote` then moves a staged draft's files into the assets root,
 * registers the entry in `assets.json`, and prunes it from `drafts.json`.
 *
 * The staging tree mirrors the production layout exactly, so a draft entry's
 * relative `path`/`preview`/`animation` are already the paths the asset will
 * occupy once promoted — promotion is a move, never a rewrite, and the sidecar
 * relative links survive it untouched.
 *
 * Promotion is best-effort transactional and idempotent: each draft is committed
 * independently (move files → register → prune that one draft) and rolled back on
 * a commit failure, so a mid-batch error never registers an entry with its files
 * missing. The prune is a separate write, so a prune failure can still leave a
 * committed draft listed in `drafts.json` — but a re-run detects an already-
 * promoted draft (registered, files no longer staged) and simply re-prunes it
 * instead of promoting it twice.
 */

/** Assets root for a game repo — mirrors `runAssetPipeline`'s default outputRoot. */
export function assetsRootForRepo(repo: string): string {
  return join(repo, "src/assets");
}

/** Staging dir that holds generated-but-unpromoted draft assets. */
export function draftsRoot(assetsRoot: string): string {
  return join(assetsRoot, "drafts");
}

/** Draft manifest path (a mirror of `assets.json`, but for staged drafts). */
export function draftsManifestPath(assetsRoot: string): string {
  return join(draftsRoot(assetsRoot), "drafts.json");
}

/** Production manifest path. */
export function assetsManifestPath(assetsRoot: string): string {
  return join(assetsRoot, "assets.json");
}

export interface DraftManifest {
  assets: AssetEntry[];
}

/**
 * Relative file paths an entry occupies on disk (under whichever root holds it):
 * the asset itself plus any sidecars — the sprite billboard preview and the
 * sprite-anim frame map. Duplicates and blanks are dropped.
 */
export function filesForEntry(entry: AssetEntry): string[] {
  const seen = new Set<string>();
  for (const candidate of [entry.path, entry.preview, entry.animation]) {
    if (typeof candidate === "string" && candidate.length > 0) seen.add(candidate);
  }
  return [...seen];
}

/** Read a draft manifest, tolerating a missing/empty file (no drafts yet). */
export async function readDraftManifest(manifestPath: string): Promise<DraftManifest> {
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
    if (Array.isArray(parsed?.assets)) return { assets: parsed.assets as AssetEntry[] };
  } catch {
    /* no drafts staged yet */
  }
  return { assets: [] };
}

/**
 * Write a draft manifest atomically (temp file + rename) so a crash or full disk
 * mid-write can never leave a half-written, unparseable `drafts.json`.
 */
async function writeDraftManifest(manifestPath: string, data: DraftManifest): Promise<void> {
  await mkdir(dirname(manifestPath), { recursive: true });
  const tmp = `${manifestPath}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n");
  await rename(tmp, manifestPath);
}

export interface DraftSelection {
  selected: AssetEntry[];
  /** Requested ids that matched no draft (only meaningful when selecting by id). */
  missing: string[];
}

/**
 * Pure selection: every draft (`all`) or just the requested ids. An id selects
 * every draft sharing it (drafts are keyed by id+kind, so one id can stage more
 * than one kind). Stable order is preserved.
 */
export function selectDrafts(drafts: AssetEntry[], opts: { ids?: string[]; all?: boolean }): DraftSelection {
  if (opts.all) return { selected: [...drafts], missing: [] };
  const ids = opts.ids ?? [];
  const wanted = new Set(ids);
  const selected = drafts.filter((d) => wanted.has(d.id));
  const present = new Set(selected.map((d) => d.id));
  const missing = ids.filter((id) => !present.has(id));
  return { selected, missing };
}

/**
 * Cross-device move fallback: copy the source then remove it, verifying the
 * copy actually landed before deleting the original. Exported for testing the
 * EXDEV path without an actual second filesystem.
 */
export async function copyThenRemove(src: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  if (!existsSync(dest)) throw new Error(`cross-device copy failed to write ${dest}`);
  await rm(src, { force: true });
}

/** Move a file, preferring `rename` and falling back to copy+remove across devices. */
async function moveFile(src: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  try {
    await rename(src, dest);
    return;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "EXDEV") throw err;
  }
  await copyThenRemove(src, dest);
}

function errMessage(err: unknown): string {
  return String((err as Error)?.message ?? err);
}

export interface PromoteResult {
  promoted: AssetEntry[];
  /** Relative paths actually moved out of the staging tree. */
  movedFiles: string[];
}

export interface PromoteOptions {
  assetsRoot: string;
  ids?: string[];
  all?: boolean;
  log?: (line: string) => void;
}

/**
 * Promote staged drafts into the production manifest. For each selected draft it
 * moves every file the entry references from the staging tree into the assets
 * root, registers the entry in `assets.json`, then prunes that draft from
 * `drafts.json` before moving on.
 *
 * Validation (unknown ids, missing primary files) runs up front, so a bad
 * request fails before any file is moved. If a single draft fails to commit
 * (e.g. an invalid license record, a disk error, or a partial sidecar move) its
 * already-moved files are rolled back into staging and the run aborts — earlier
 * drafts stay committed-and-pruned, this and later drafts stay fully staged.
 *
 * Promotion is idempotent. The commit (move files → register) and the
 * drafts.json prune are separate writes, so a prune that fails after a commit
 * can strand an already-promoted draft (its files are in production and it is
 * registered, yet it is still listed in `drafts.json`). A re-run heals such a
 * strand instead of double-promoting: a selected draft whose primary file is
 * gone from staging but already registered in production is treated as
 * already-promoted and merely re-pruned — no second move, no double register.
 *
 * Throws on an unknown id, a draft whose primary asset file is missing from both
 * staging and production, or a commit failure.
 */
export async function promoteDrafts(opts: PromoteOptions): Promise<PromoteResult> {
  const log = opts.log ?? (() => {});
  const assetsRoot = opts.assetsRoot;
  const stagingRoot = draftsRoot(assetsRoot);
  const draftManifest = draftsManifestPath(assetsRoot);
  const prodManifest = assetsManifestPath(assetsRoot);

  const { assets: drafts } = await readDraftManifest(draftManifest);
  const { selected, missing } = selectDrafts(drafts, { ids: opts.ids, all: opts.all });

  if (missing.length > 0) {
    throw new Error(
      `no staged draft for id(s): ${missing.join(", ")}. ` +
        `available: ${drafts.map((d) => d.id).join(", ") || "(none)"}`,
    );
  }

  // What's already registered in production tells us which selected drafts were
  // committed by an earlier run whose prune didn't land. The production manifest
  // shares the `{ assets: [...] }` shape, so the same tolerant reader serves it.
  const { assets: registered } = await readDraftManifest(prodManifest);
  const registeredKeys = new Set(registered.map((e) => `${e.id}:${e.kind}`));

  // Pre-flight classification, before any file moves:
  //   - primary file staged           -> a fresh draft to move + register + prune
  //   - primary gone, but registered   -> already promoted; only the prune is owed
  //   - primary gone and unregistered  -> genuinely missing; reject before changes
  // Folding the "already promoted" case in here (instead of rejecting it) is what
  // makes a re-run after a stranded prune heal rather than fail.
  const alreadyPromoted = new Set<AssetEntry>();
  const missingFiles: string[] = [];
  for (const entry of selected) {
    if (existsSync(join(stagingRoot, entry.path))) continue; // a normal staged draft
    if (registeredKeys.has(`${entry.id}:${entry.kind}`)) alreadyPromoted.add(entry);
    else missingFiles.push(`${entry.id}:${entry.kind} (${entry.path})`);
  }
  if (missingFiles.length > 0) {
    throw new Error(`draft file(s) missing under ${stagingRoot}: ${missingFiles.join(", ")}`);
  }

  const promoted: AssetEntry[] = [];
  const movedFiles: string[] = [];

  for (const entry of selected) {
    if (alreadyPromoted.has(entry)) {
      // Files were moved and registered on a prior run, but its drafts.json prune
      // never landed. Re-moving (files are gone) or re-registering would be wrong;
      // just record it so the prune below clears the stale draft. Idempotent.
      promoted.push(entry);
      log(`[already-promoted] ${entry.id}:${entry.kind} — clearing stale draft`);
    } else {
      const moved: string[] = [];
      try {
        for (const rel of filesForEntry(entry)) {
          const src = join(stagingRoot, rel);
          if (!existsSync(src)) continue; // optional sidecars may legitimately be absent
          await moveFile(src, join(assetsRoot, rel));
          moved.push(rel);
          log(`[moved] ${rel}`);
        }
        await register(prodManifest, entry);
      } catch (err) {
        // Roll this entry's moves back into staging so the draft stays intact, then
        // abort — the production manifest never gets an entry without its files.
        for (const rel of moved) {
          try {
            await moveFile(join(assetsRoot, rel), join(stagingRoot, rel));
          } catch {
            /* best-effort restore — the throw below still surfaces the failure */
          }
        }
        throw new Error(`failed to promote ${entry.id}:${entry.kind}: ${errMessage(err)}`);
      }
      promoted.push(entry);
      movedFiles.push(...moved);
      log(`[promoted] ${entry.id}:${entry.kind} -> ${prodManifest}`);
    }

    // Prune every draft committed so far (fresh + healed) from drafts.json in one
    // atomic temp-file write. The survivor set is re-derived from the original
    // `drafts` each pass, so the prune is idempotent: re-pruning an entry that is
    // already gone is a no-op, and a prune that fails here strands at most the
    // current entry — which the next entry's prune, or a re-run, heals.
    const promotedKeys = new Set(promoted.map((e) => `${e.id}:${e.kind}`));
    await writeDraftManifest(draftManifest, {
      assets: drafts.filter((d) => !promotedKeys.has(`${d.id}:${d.kind}`)),
    });
  }

  return { promoted, movedFiles };
}
