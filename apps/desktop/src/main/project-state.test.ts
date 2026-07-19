import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { projectFromRepoPath } from "./projects";
import { createProjectState } from "./project-state";

const tempRoots = [];

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shipshit-project-state-"));
  tempRoots.push(root);
  return root;
}

function createRepo(root, slug) {
  const repoPath = path.join(root, slug);
  const manifestDir = path.join(repoPath, "src", "assets");
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(
    path.join(manifestDir, "assets.json"),
    JSON.stringify({ assets: [] }),
  );
  return repoPath;
}

function createHarness(initial: any = {}, slugs = ["alpha", "bravo"]) {
  const root = tempRoot();
  const repos = Object.fromEntries(
    slugs.map((slug) => [slug, createRepo(root, slug)]),
  );
  let stored = initial;
  const writes = [];
  const state = createProjectState({
    readSettingsFile: () => stored,
    writeSettingsFile: (next) => {
      stored = next;
      writes.push(next);
    },
    gameDir: (slug) => repos[slug] || path.join(root, slug),
    gameSlugs: slugs,
    pathExists: fs.existsSync,
  });
  return {
    repos,
    root,
    state,
    stored: () => stored,
    writes,
  };
}

afterEach(() => {
  while (tempRoots.length) {
    fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
});

test("mergeSettings deep-merges provider routes but replaces fal model overrides", () => {
  const harness = createHarness({
    providerDefaults: { sprite: "fal" },
    falModelDefaults: { sprite: "fal-ai/flux/dev" },
  });

  const settings = harness.state.mergeSettings({
    providerDefaults: { texture: "fal" },
    falModelDefaults: {},
  });

  expect(settings.providerDefaults.sprite).toBe("fal");
  expect(settings.providerDefaults.texture).toBe("fal");
  expect(settings.falModelDefaults).toEqual({});
  expect(harness.writes).toHaveLength(1);
});

test("resolveProjectTarget preserves the requested, game, active, and fallback order", () => {
  const first = createHarness();
  const alpha = projectFromRepoPath(first.repos.alpha, {
    slug: "alpha",
    source: "discovered",
  });
  const bravo = projectFromRepoPath(first.repos.bravo, {
    slug: "bravo",
    source: "discovered",
  });
  first.state.mergeSettings({
    activeProjectId: bravo.id,
    defaultGame: "alpha",
  });

  expect(first.state.resolveProjectTarget({ projectId: alpha.id }).slug).toBe(
    "alpha",
  );
  expect(first.state.resolveProjectTarget({ game: "alpha" }).slug).toBe("alpha");
  expect(first.state.resolveProjectTarget().slug).toBe("bravo");

  const fallback = createHarness({ defaultGame: "alpha" }, []);
  expect(fallback.state.resolveProjectTarget({ game: "charlie" })).toMatchObject({
    slug: "charlie",
    repoPath: path.join(fallback.root, "charlie"),
  });
  expect(fallback.state.resolveProjectTarget().slug).toBe("alpha");
});

test("persistProjects excludes discovered records and updates the active default game", () => {
  const harness = createHarness();
  const registeredRoot = createRepo(tempRoot(), "registered-ip");
  const registered = projectFromRepoPath(registeredRoot, {
    slug: "registered-ip",
    source: "registered",
  });
  const discovered = projectFromRepoPath(harness.repos.alpha, {
    slug: "alpha",
    source: "discovered",
  });

  harness.state.persistProjects(
    [registered, discovered],
    registered.id,
  );

  expect(harness.stored().projects).toEqual([registered]);
  expect(harness.stored().activeProjectId).toBe(registered.id);
  expect(harness.stored().defaultGame).toBe("registered-ip");
});

test("listProjectState and resolveGame expose one canonical project view", () => {
  const harness = createHarness({ defaultGame: "bravo" });

  expect(harness.state.listGames()).toEqual(["alpha", "bravo"]);
  expect(harness.state.listProjectState()).toMatchObject({
    activeProjectId: expect.any(String),
    activeManifestPath: expect.stringContaining(
      path.join("src", "assets", "assets.json"),
    ),
  });
  expect(harness.state.resolveGame("alpha")).toBe("alpha");
  expect(harness.state.resolveGame({ game: "alpha" })).toBe("alpha");
  expect(harness.state.resolveGame({})).toBe("bravo");
});
