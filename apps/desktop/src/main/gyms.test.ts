import { afterEach, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createGymLauncher, normalizeGymTester, readGymDeclaration } from "./gyms";

const temps = [];

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shipshit-gyms-"));
  temps.push(root);
  return root;
}

function writeDeclaration(root, data, rel = "studio.gyms.json") {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

function project(root, overrides: any = {}) {
  return {
    id: overrides.id || "project-1",
    name: overrides.name || "Scourge Survivors",
    slug: overrides.slug || "scourge-survivors",
    repoPath: root,
  };
}

function mockSpawn(calls) {
  return (command, args, opts) => {
    const child = new EventEmitter() as any;
    child.pid = 771;
    child.unrefCalled = false;
    child.unref = () => { child.unrefCalled = true; };
    calls.push({ command, args, opts, child });
    queueMicrotask(() => child.emit("spawn"));
    return child;
  };
}

afterEach(() => {
  while (temps.length) fs.rmSync(temps.pop(), { recursive: true, force: true });
});

test("readGymDeclaration normalizes script, args, url, and cwd", () => {
  const root = tempRepo();
  fs.mkdirSync(path.join(root, "tools"));
  const file = writeDeclaration(root, {
    gyms: [
      {
        id: "character",
        label: "Character Gym",
        kind: "character",
        description: "Animation and bounds pass",
        script: "gym:character",
        args: ["--port", 5175],
        url: "http://localhost:5175/gyms/character",
        cwd: "tools",
      },
    ],
  });

  const result = readGymDeclaration(root);

  expect(result.declarationPath).toBe(file);
  expect(result.error).toBeNull();
  expect(result.gyms).toHaveLength(1);
  expect(result.gyms[0]).toMatchObject({
    id: "character",
    label: "Character Gym",
    kind: "character",
    script: "gym:character",
    command: null,
    args: ["--port", "5175"],
    url: "http://localhost:5175/gyms/character",
    cwd: path.join(root, "tools"),
  });
});

test("readGymDeclaration reports no gyms when a project has no declaration", () => {
  const root = tempRepo();
  const result = readGymDeclaration(root);

  expect(result.exists).toBe(false);
  expect(result.gyms).toEqual([]);
  expect(result.error).toBeNull();
  expect(result.declarationPath).toBe(path.join(root, "studio.gyms.json"));
});

test("readGymDeclaration clamps cwd traversal back to the repo root", () => {
  const root = tempRepo();
  writeDeclaration(root, { gyms: [{ id: "playground", script: "gym", cwd: "../../outside" }] });

  const result = readGymDeclaration(root);

  expect(result.gyms[0].cwd).toBe(root);
});

test("createGymLauncher lists gyms for every project", () => {
  const withGym = tempRepo();
  const withoutGym = tempRepo();
  writeDeclaration(withGym, { gyms: [{ id: "character", script: "gym:character" }] });
  const launcher = createGymLauncher({
    projects: [project(withGym, { id: "with" }), project(withoutGym, { id: "without", slug: "deadlane" })],
    activeProjectId: "with",
  });

  const state = launcher.list();

  expect(state.activeProjectId).toBe("with");
  expect(state.projects.find((p) => p.id === "with").gyms.map((g) => g.id)).toEqual(["character"]);
  expect(state.projects.find((p) => p.id === "without").gyms).toEqual([]);
});

test("launch runs a declared bun script and opens the declared url", async () => {
  const root = tempRepo();
  writeDeclaration(root, {
    gyms: [{ id: "character", script: "gym:character", args: ["--watch"], url: "http://localhost:5175/gym" }],
  });
  const calls = [];
  const opened = [];
  const launcher = createGymLauncher({
    projects: [project(root)],
    activeProjectId: "project-1",
    spawn: mockSpawn(calls),
    openExternal: async (url) => { opened.push(url); },
    env: { PATH: "/bin" },
  });

  const result = await launcher.launch({ projectId: "project-1", gymId: "character" });

  expect(result.ok).toBe(true);
  expect(result.pid).toBe(771);
  expect(result.openedUrl).toBe(true);
  expect(opened).toEqual(["http://localhost:5175/gym"]);
  expect(calls[0]).toMatchObject({
    command: "bun",
    args: ["run", "gym:character", "--watch"],
    opts: { cwd: root, detached: true, stdio: "ignore" },
  });
  expect(calls[0].child.unrefCalled).toBe(true);
});

test("launch still runs a valid gym when a sibling declaration entry is invalid", async () => {
  const root = tempRepo();
  writeDeclaration(root, { gyms: [{ id: "broken" }, { id: "playground", script: "gym:playground" }] });
  const calls = [];
  const launcher = createGymLauncher({
    projects: [project(root)],
    spawn: mockSpawn(calls),
  });

  const result = await launcher.launch({ projectId: "project-1", gymId: "playground" });

  expect(result.ok).toBe(true);
  expect(calls[0].args).toEqual(["run", "gym:playground"]);
});

test("a gym without a tester block reads back with tester null", () => {
  const root = tempRepo();
  writeDeclaration(root, { gyms: [{ id: "playfield", url: "http://localhost:5199/" }] });

  const result = readGymDeclaration(root);

  expect(result.error).toBeNull();
  expect(result.gyms[0].tester).toBeNull();
});

test("an empty tester block fills every default", () => {
  const root = tempRepo();
  writeDeclaration(root, { gyms: [{ id: "playfield", url: "http://localhost:5199/", tester: {} }] });

  const result = readGymDeclaration(root);

  expect(result.error).toBeNull();
  expect(result.gyms[0].tester).toEqual({
    ready: "canvas",
    readyTimeoutMs: 15000,
    canvas: "canvas",
    press: [],
    hold: [],
    shots: [],
    observeMs: 2000,
    frames: 0,
    checkBlank: true,
    bootTimeoutMs: 30000,
  });
});

test("tester numbers clamp to their documented ranges", () => {
  const normalized = normalizeGymTester({
    readyTimeoutMs: 50,
    observeMs: 999999,
    frames: 99,
    bootTimeoutMs: 1_000_000_000,
  });

  expect(normalized.error).toBeUndefined();
  expect(normalized.tester).toMatchObject({
    readyTimeoutMs: 1000,
    observeMs: 60000,
    frames: 12,
    bootTimeoutMs: 180000,
  });
});

test("tester press/hold/shots accept a string or an array of strings", () => {
  const fromStrings = normalizeGymTester({ press: "ArrowUp, Space", hold: "ArrowRight:500", shots: "boot" });
  expect(fromStrings.tester).toMatchObject({
    press: ["ArrowUp", "Space"],
    hold: ["ArrowRight:500"],
    shots: ["boot"],
  });

  const fromArrays = normalizeGymTester({ press: ["ArrowUp,Space", "KeyW"], hold: ["a:100", "d:200"], shots: ["boot", "after"] });
  expect(fromArrays.tester).toMatchObject({
    press: ["ArrowUp", "Space", "KeyW"],
    hold: ["a:100", "d:200"],
    shots: ["boot", "after"],
  });
});

test("an invalid tester block invalidates only that gym entry", () => {
  const root = tempRepo();
  writeDeclaration(root, {
    gyms: [
      { id: "broken", url: "http://localhost:5199/", tester: { hold: ["nope"] } },
      { id: "playfield", url: "http://localhost:5200/" },
    ],
  });

  const result = readGymDeclaration(root);

  expect(result.error).toContain("gyms[0]");
  expect(result.error).toContain("tester.hold");
  expect(result.gyms.map((gym) => gym.id)).toEqual(["playfield"]);
});

test("normalizeGymTester rejects wrong types and non-finite numbers", () => {
  expect(normalizeGymTester("yes").error).toContain("tester must be an object");
  expect(normalizeGymTester({ readyTimeoutMs: "fast" }).error).toContain("tester.readyTimeoutMs");
  expect(normalizeGymTester({ observeMs: Number.NaN }).error).toContain("tester.observeMs");
  expect(normalizeGymTester({ bootTimeoutMs: Infinity }).error).toContain("tester.bootTimeoutMs");
  expect(normalizeGymTester({ press: [7] }).error).toContain("tester.press");
  expect(normalizeGymTester({ checkBlank: "yes" }).error).toContain("tester.checkBlank");
  expect(normalizeGymTester({ hold: ["ArrowUp:"] }).error).toContain("tester.hold");
});

test("launch surfaces a readable spawn failure", async () => {
  const root = tempRepo();
  writeDeclaration(root, { gyms: [{ id: "broken", command: "missing-gym-bin" }] });
  const launcher = createGymLauncher({
    projects: [project(root)],
    spawn() {
      throw new Error("ENOENT");
    },
  });

  const result = await launcher.launch({ projectId: "project-1", gymId: "broken" });

  expect(result.ok).toBe(false);
  expect(result.error).toContain("Failed to launch missing-gym-bin");
  expect(result.error).toContain("ENOENT");
});
