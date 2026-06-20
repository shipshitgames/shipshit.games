import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assetsManifestPath,
  assetsRootForRepo,
  copyThenRemove,
  draftsManifestPath,
  draftsRoot,
  filesForEntry,
  promoteDrafts,
  readDraftManifest,
  selectDrafts,
} from "./drafts";
import { assertLicenseRecord } from "./manifest";
import type { AssetEntry } from "./manifest";

function spriteEntry(id: string, extra: Partial<AssetEntry> = {}): AssetEntry {
  return {
    id,
    kind: "sprite",
    game: "shared",
    path: `sprites/${id}.webp`,
    license: { tool: "mock", plan: "mock", date: "2026-06-20", kind: "sprite" },
    ...extra,
  };
}

/** Stage `entry` plus the files it references under a fresh assets root. */
async function stageDraft(assetsRoot: string, entry: AssetEntry): Promise<void> {
  // Fail fast if a test builds a license-incomplete entry (register would only
  // catch it later, at promote time).
  assertLicenseRecord(entry);
  const staging = draftsRoot(assetsRoot);
  for (const rel of filesForEntry(entry)) {
    const abs = join(staging, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, `bytes:${rel}`);
  }
  const manifestPath = draftsManifestPath(assetsRoot);
  const current = await readDraftManifest(manifestPath);
  current.assets.push(entry);
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(current, null, 2) + "\n");
}

test("filesForEntry returns the asset plus its sidecars, de-duped and blank-free", () => {
  assert.deepEqual(filesForEntry(spriteEntry("a")), ["sprites/a.webp"]);
  assert.deepEqual(
    filesForEntry(spriteEntry("b", { preview: "previews/b.html", animation: "sprites/b.anim.json" })),
    ["sprites/b.webp", "previews/b.html", "sprites/b.anim.json"],
  );
  // A sidecar that happens to equal the asset path collapses to one entry.
  assert.deepEqual(filesForEntry(spriteEntry("c", { preview: "sprites/c.webp" })), ["sprites/c.webp"]);
});

test("path helpers nest drafts under the assets root", () => {
  const assetsRoot = assetsRootForRepo("/repo");
  assert.equal(assetsRoot, join("/repo", "src/assets"));
  assert.equal(draftsRoot(assetsRoot), join(assetsRoot, "drafts"));
  assert.equal(draftsManifestPath(assetsRoot), join(assetsRoot, "drafts", "drafts.json"));
  assert.equal(assetsManifestPath(assetsRoot), join(assetsRoot, "assets.json"));
});

test("selectDrafts picks by id and reports unknown ids", () => {
  const drafts = [spriteEntry("a"), spriteEntry("b")];
  assert.deepEqual(
    selectDrafts(drafts, { ids: ["a"] }).selected.map((d) => d.id),
    ["a"],
  );
  const miss = selectDrafts(drafts, { ids: ["a", "zzz"] });
  assert.deepEqual(miss.selected.map((d) => d.id), ["a"]);
  assert.deepEqual(miss.missing, ["zzz"]);
});

test("selectDrafts with all takes everything and reports nothing missing", () => {
  const drafts = [spriteEntry("a"), spriteEntry("b")];
  const sel = selectDrafts(drafts, { all: true });
  assert.deepEqual(sel.selected.map((d) => d.id), ["a", "b"]);
  assert.deepEqual(sel.missing, []);
});

test("selectDrafts by id pulls every kind sharing that id", () => {
  const drafts = [spriteEntry("hero"), { ...spriteEntry("hero"), kind: "icon", path: "icons/hero.webp" }];
  const sel = selectDrafts(drafts, { ids: ["hero"] });
  assert.deepEqual(
    sel.selected.map((d) => `${d.id}:${d.kind}`),
    ["hero:sprite", "hero:icon"],
  );
});

test("promoteDrafts moves files, registers the entry, and prunes the draft", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-drafts-promote-"));
  const assetsRoot = assetsRootForRepo(repo);
  await stageDraft(assetsRoot, spriteEntry("swarm-husk", { preview: "previews/swarm-husk.html" }));

  const result = await promoteDrafts({ assetsRoot, ids: ["swarm-husk"] });

  assert.deepEqual(result.promoted.map((e) => e.id), ["swarm-husk"]);
  assert.deepEqual(result.movedFiles.sort(), ["previews/swarm-husk.html", "sprites/swarm-husk.webp"]);

  // Files moved out of staging into the production tree.
  assert.equal(existsSync(join(assetsRoot, "sprites/swarm-husk.webp")), true);
  assert.equal(existsSync(join(assetsRoot, "previews/swarm-husk.html")), true);
  assert.equal(existsSync(join(draftsRoot(assetsRoot), "sprites/swarm-husk.webp")), false);
  assert.equal(existsSync(join(draftsRoot(assetsRoot), "previews/swarm-husk.html")), false);

  // Registered in assets.json, pruned from drafts.json.
  const prod = JSON.parse(await readFile(assetsManifestPath(assetsRoot), "utf8"));
  assert.equal(prod.assets.length, 1);
  assert.equal(prod.assets[0].id, "swarm-husk");
  const drafts = await readDraftManifest(draftsManifestPath(assetsRoot));
  assert.equal(drafts.assets.length, 0);
});

test("promoteDrafts with all promotes every staged draft", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-drafts-all-"));
  const assetsRoot = assetsRootForRepo(repo);
  await stageDraft(assetsRoot, spriteEntry("a"));
  await stageDraft(assetsRoot, spriteEntry("b"));

  const result = await promoteDrafts({ assetsRoot, all: true });

  assert.deepEqual(result.promoted.map((e) => e.id).sort(), ["a", "b"]);
  const prod = JSON.parse(await readFile(assetsManifestPath(assetsRoot), "utf8"));
  assert.deepEqual(prod.assets.map((e: AssetEntry) => e.id).sort(), ["a", "b"]);
  const drafts = await readDraftManifest(draftsManifestPath(assetsRoot));
  assert.equal(drafts.assets.length, 0);
});

test("promoteDrafts leaves unselected drafts staged", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-drafts-partial-"));
  const assetsRoot = assetsRootForRepo(repo);
  await stageDraft(assetsRoot, spriteEntry("keep"));
  await stageDraft(assetsRoot, spriteEntry("ship"));

  await promoteDrafts({ assetsRoot, ids: ["ship"] });

  const drafts = await readDraftManifest(draftsManifestPath(assetsRoot));
  assert.deepEqual(drafts.assets.map((d) => d.id), ["keep"]);
  assert.equal(existsSync(join(draftsRoot(assetsRoot), "sprites/keep.webp")), true);
  assert.equal(existsSync(join(assetsRoot, "sprites/ship.webp")), true);
});

test("promoteDrafts rejects an unknown id without touching disk", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-drafts-missing-id-"));
  const assetsRoot = assetsRootForRepo(repo);
  await stageDraft(assetsRoot, spriteEntry("real"));

  await assert.rejects(() => promoteDrafts({ assetsRoot, ids: ["ghost"] }), /no staged draft for id/);
  // Nothing promoted: the real draft is untouched, assets.json never created.
  assert.equal(existsSync(assetsManifestPath(assetsRoot)), false);
  const drafts = await readDraftManifest(draftsManifestPath(assetsRoot));
  assert.deepEqual(drafts.assets.map((d) => d.id), ["real"]);
});

test("promoteDrafts rejects a draft whose primary file is missing", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-drafts-missing-file-"));
  const assetsRoot = assetsRootForRepo(repo);
  // Register the draft in the manifest but never stage its file.
  const manifestPath = draftsManifestPath(assetsRoot);
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify({ assets: [spriteEntry("phantom")] }, null, 2) + "\n");

  await assert.rejects(() => promoteDrafts({ assetsRoot, ids: ["phantom"] }), /missing its file|file\(s\) missing/);
  assert.equal(existsSync(assetsManifestPath(assetsRoot)), false);
});

test("promoteDrafts with all on an empty staging area is a no-op", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-drafts-empty-"));
  const assetsRoot = assetsRootForRepo(repo);

  const result = await promoteDrafts({ assetsRoot, all: true });

  assert.deepEqual(result.promoted, []);
  // No spurious drafts.json is written when there was nothing to promote.
  assert.equal(existsSync(draftsManifestPath(assetsRoot)), false);
});

test("promoteDrafts tolerates a missing optional sidecar and keeps its manifest field", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-drafts-sidecar-"));
  const assetsRoot = assetsRootForRepo(repo);
  const entry = spriteEntry("lonely", { preview: "previews/lonely.html" });
  // Stage only the primary file; the preview sidecar never gets written.
  const primaryAbs = join(draftsRoot(assetsRoot), entry.path);
  await mkdir(dirname(primaryAbs), { recursive: true });
  await writeFile(primaryAbs, "bytes");
  const manifestPath = draftsManifestPath(assetsRoot);
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify({ assets: [entry] }, null, 2) + "\n");

  const result = await promoteDrafts({ assetsRoot, ids: ["lonely"] });

  // The absent sidecar is skipped from the move, but the entry is still promoted
  // with its preview path intact (the runtime can regenerate it).
  assert.deepEqual(result.movedFiles, ["sprites/lonely.webp"]);
  assert.equal(existsSync(join(assetsRoot, "sprites/lonely.webp")), true);
  assert.equal(existsSync(join(assetsRoot, "previews/lonely.html")), false);
  const prod = JSON.parse(await readFile(assetsManifestPath(assetsRoot), "utf8"));
  assert.equal(prod.assets[0].preview, "previews/lonely.html");
});

test("promoteDrafts rolls back moves when registration rejects the entry", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-drafts-rollback-"));
  const assetsRoot = assetsRootForRepo(repo);
  // A license-incomplete entry passes the file pre-flight but makes register()
  // throw — staged directly so we bypass stageDraft's assertLicenseRecord guard.
  const broken = { id: "bad", kind: "sprite", game: "shared", path: "sprites/bad.webp" } as AssetEntry;
  const primaryAbs = join(draftsRoot(assetsRoot), broken.path);
  await mkdir(dirname(primaryAbs), { recursive: true });
  await writeFile(primaryAbs, "bytes");
  const manifestPath = draftsManifestPath(assetsRoot);
  await writeFile(manifestPath, JSON.stringify({ assets: [broken] }, null, 2) + "\n");

  await assert.rejects(() => promoteDrafts({ assetsRoot, ids: ["bad"] }), /failed to promote bad:sprite/);

  // Rolled back: the file is back in staging, production untouched, draft intact.
  assert.equal(existsSync(primaryAbs), true, "file must be restored to staging");
  assert.equal(existsSync(join(assetsRoot, "sprites/bad.webp")), false, "production must stay clean");
  assert.equal(existsSync(assetsManifestPath(assetsRoot)), false, "assets.json must not be created");
  const drafts = await readDraftManifest(manifestPath);
  assert.deepEqual(drafts.assets.map((d) => d.id), ["bad"], "draft must remain staged");
});

test("copyThenRemove copies the source to the destination and deletes the original", async () => {
  // Exercises the EXDEV cross-device fallback path without a second filesystem.
  const dir = await mkdtemp(join(tmpdir(), "assetgen-copy-remove-"));
  const src = join(dir, "from", "a.bin");
  const dest = join(dir, "to", "nested", "a.bin");
  await mkdir(dirname(src), { recursive: true });
  await writeFile(src, "payload");

  await copyThenRemove(src, dest);

  assert.equal(existsSync(src), false, "source must be removed after a successful copy");
  assert.equal(existsSync(dest), true, "destination must exist");
  assert.equal(await readFile(dest, "utf8"), "payload");
});
