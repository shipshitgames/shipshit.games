import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  manifestPathForRepo,
  projectFromRepoPath,
  summarizeProject,
  uniqueProjects,
  validateAssetsManifestData,
} from "./projects";

const tmpRoots = [];

async function makeRepo(manifest) {
  const root = await mkdtemp(join(tmpdir(), "shipshit-project-"));
  tmpRoots.push(root);
  await mkdir(join(root, "src", "assets"), { recursive: true });
  if (manifest !== undefined) {
    await writeFile(join(root, "src", "assets", "assets.json"), JSON.stringify(manifest, null, 2));
  }
  return root;
}

afterEach(async () => {
  while (tmpRoots.length) {
    await rm(tmpRoots.pop(), { recursive: true, force: true });
  }
});

test("summarizeProject validates and surfaces a local assets catalog", async () => {
  const repo = await makeRepo({
    assets: [
      { id: "swarm-husk", kind: "sprite", game: "scourge-survivors", path: "sprites/swarm-husk.webp" },
      { id: "rifle-report", kind: "sfx", game: "scourge-survivors", path: "audio/sfx/rifle-report.webm" },
    ],
  });
  const project = projectFromRepoPath(repo, { slug: "scourge-survivors", name: "Scourge Survivors" });
  const summary = summarizeProject(project, project.id);

  expect(summary.valid).toBe(true);
  expect(summary.isActive).toBe(true);
  expect(summary.manifestPath).toBe(manifestPathForRepo(repo));
  expect(summary.assetCount).toBe(2);
  expect(summary.kindCounts).toEqual({ sprite: 1, sfx: 1 });
  expect(summary.assets.map((asset) => asset.id)).toEqual(["swarm-husk", "rifle-report"]);
});

test("validateAssetsManifestData rejects malformed asset entries", () => {
  const result = validateAssetsManifestData({
    assets: [{ id: "broken", kind: "sprite" }],
  });

  expect(result.valid).toBe(false);
  expect(result.errors).toEqual(["assets[0].path must be a non-empty string"]);
});

test("uniqueProjects keeps the first record for a repo path", async () => {
  const repo = await makeRepo({ assets: [] });
  const first = projectFromRepoPath(repo, { slug: "deadlane", source: "registered" });
  const second = projectFromRepoPath(repo, { slug: "ignored", source: "discovered" });

  expect(uniqueProjects([first, second])).toEqual([first]);
});
