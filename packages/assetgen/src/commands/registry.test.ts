import assert from "node:assert/strict";
import { isAbsolute, join } from "node:path";
import { test } from "node:test";

import { defaultAssetsDir, defaultGamesRoot, defaultRepo } from "./paths.ts";
import {
  findProject,
  listProjects,
  projectAssetsDir,
  projectGamesRoot,
  projectRepo,
  selectedProject,
  UnknownProjectError,
} from "./registry.ts";

const ENV_KEYS = ["ASSETGEN_IP", "ASSETGEN_PROJECT_ROOT", "ASSETGEN_PROJECTS"] as const;

function withEnv(env: Partial<Record<(typeof ENV_KEYS)[number], string>>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  try {
    fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("no selection env -> selectedProject() is undefined (legacy defaults preserved)", () => {
  withEnv({}, () => {
    assert.equal(selectedProject(), undefined);
  });
});

test("ASSETGEN_PROJECT_ROOT selects an ad-hoc project and derives paths", () => {
  withEnv({ ASSETGEN_PROJECT_ROOT: "/tmp/my-ip" }, () => {
    const p = selectedProject();
    assert.ok(p);
    assert.equal(p.id, "custom");
    assert.equal(p.root, "/tmp/my-ip");
    assert.equal(projectAssetsDir(p), join("/tmp/my-ip", "packages", "assets"));
    assert.equal(projectGamesRoot(p), join("/tmp/my-ip", "apps", "games"));
    assert.equal(projectRepo(p, "scourge-survivors"), join("/tmp/my-ip", "apps", "games", "scourge-survivors"));
  });
});

test("ASSETGEN_PROJECTS registers IPs selectable by ASSETGEN_IP", () => {
  const projects = JSON.stringify([{ id: "nocturne", name: "Nocturne", root: "/tmp/nocturne" }]);
  withEnv({ ASSETGEN_PROJECTS: projects, ASSETGEN_IP: "nocturne" }, () => {
    const p = selectedProject();
    assert.ok(p);
    assert.equal(p.id, "nocturne");
    assert.equal(p.root, "/tmp/nocturne");
    assert.ok(listProjects().some((e) => e.id === "nocturne"));
    assert.ok(findProject("nocturne"));
  });
});

test("per-project assetsDir / gamesRoot overrides are honoured", () => {
  const projects = JSON.stringify([{ id: "weird", root: "/tmp/weird", assetsDir: "art", gamesRoot: "/abs/games" }]);
  withEnv({ ASSETGEN_PROJECTS: projects, ASSETGEN_IP: "weird" }, () => {
    const p = selectedProject();
    assert.ok(p);
    assert.equal(projectAssetsDir(p), join("/tmp/weird", "art"));
    assert.equal(projectGamesRoot(p), "/abs/games");
  });
});

test("relative project roots resolve to absolute", () => {
  withEnv({ ASSETGEN_PROJECTS: JSON.stringify([{ id: "rel", root: "some/where" }]), ASSETGEN_IP: "rel" }, () => {
    const p = selectedProject();
    assert.ok(p && isAbsolute(p.root));
  });
});

test("unknown ASSETGEN_IP throws UnknownProjectError", () => {
  withEnv({ ASSETGEN_IP: "definitely-not-a-real-ip-zzz" }, () => {
    assert.throws(() => selectedProject(), UnknownProjectError);
  });
});

test("an env entry overrides a built-in of the same id", () => {
  withEnv({ ASSETGEN_PROJECTS: JSON.stringify([{ id: "deadrot", root: "/custom/deadrot" }]), ASSETGEN_IP: "deadrot" }, () => {
    const p = selectedProject();
    assert.ok(p);
    assert.equal(p.root, "/custom/deadrot");
  });
});

test("malformed ASSETGEN_PROJECTS is ignored, not thrown", () => {
  withEnv({ ASSETGEN_PROJECTS: "{not json" }, () => {
    assert.doesNotThrow(() => listProjects());
    assert.equal(selectedProject(), undefined);
  });
});

// --- paths.ts wiring -------------------------------------------------------

test("paths.ts defaults follow a selected project (ASSETGEN_PROJECT_ROOT)", () => {
  withEnv({ ASSETGEN_PROJECT_ROOT: "/tmp/ip-x" }, () => {
    assert.equal(defaultAssetsDir(), join("/tmp/ip-x", "packages", "assets"));
    assert.equal(defaultGamesRoot(), join("/tmp/ip-x", "apps", "games"));
    assert.equal(defaultRepo("redline"), join("/tmp/ip-x", "apps", "games", "redline"));
  });
});

test("paths.ts defaults fall back to legacy resolution when no project is selected", () => {
  withEnv({}, () => {
    // No throw, and a concrete path string is returned (legacy sibling scan).
    assert.equal(typeof defaultAssetsDir(), "string");
    assert.equal(typeof defaultGamesRoot(), "string");
    assert.equal(defaultRepo("shared"), process.cwd());
  });
});
