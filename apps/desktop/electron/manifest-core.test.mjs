// Parity guard: the desktop main process and assetgen must share ONE manifest
// writer + license validator (issue #17). main.cjs used to ship a private copy
// (registerDesktopAsset) with a weaker, truthiness-only license check that could
// drift from assetgen's strict, trimming check — these tests fail if that
// duplication returns or if transcodeAudio stops using the resolved manifest path.
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// The exact module main.cjs requires (CommonJS, Electron main process)...
const core = require("../../../packages/assetgen/src/manifest-core.cjs");
// ...and assetgen's public TypeScript facade (bun-run) must resolve to it.
const facade = await import("../../../packages/assetgen/src/manifest.ts");

const mainSource = await readFile(new URL("./main.cjs", import.meta.url), "utf8");

const tmpRoots = [];
async function manifestPath(name) {
  const root = await mkdtemp(join(tmpdir(), "desktop-manifest-parity-"));
  tmpRoots.push(root);
  return join(root, name, "assets.json");
}
const sampleEntry = () => ({
  id: "rifle-report",
  kind: "sfx",
  game: "scourge-survivors",
  path: "audio/sfx/rifle-report.webm",
  provider: "ffmpeg",
  license: { tool: "ffmpeg", plan: "libopus-128k", date: "2026-06-08", kind: "sfx" },
});

afterEach(async () => {
  while (tmpRoots.length) await rm(tmpRoots.pop(), { recursive: true, force: true });
});

test("desktop and assetgen resolve to one shared register implementation", () => {
  expect(typeof core.register).toBe("function");
  expect(core.register).toBe(facade.register);
  expect(core.assertLicenseRecord).toBe(facade.assertLicenseRecord);
});

test("register produces byte-identical manifests via core and facade", async () => {
  const viaCore = await manifestPath("core");
  const viaFacade = await manifestPath("facade");
  await core.register(viaCore, sampleEntry());
  await facade.register(viaFacade, sampleEntry());
  expect(await readFile(viaCore, "utf8")).toBe(await readFile(viaFacade, "utf8"));
});

test("desktop core enforces the strict (trimming) license check", async () => {
  // The behavior the old registerDesktopAsset copy lacked: "   " is not a license.
  await expect(
    core.register(await manifestPath("blank"), {
      ...sampleEntry(),
      license: { tool: "ffmpeg", plan: "   ", date: "2026-06-08", kind: "sfx" },
    }),
  ).rejects.toThrow(/requires license\.plan/);
});

test("main.cjs uses the shared writer and the resolved project manifest path", () => {
  // Imports the shared core rather than reimplementing it...
  expect(mainSource).toMatch(/require\(["'][^"']*assetgen\/src\/manifest-core\.cjs["']\)/);
  // ...carries no private manifest writer (intent guards, name-agnostic): no inline
  // upsert and no inline license validation can return without being caught.
  expect(mainSource).not.toMatch(/\.assets\.findIndex/);
  expect(mainSource).not.toMatch(/license\?\.\[/);
  // ...and transcodeAudio registers against the resolved target manifest path,
  // not a separately recomputed gameDir-based one.
  expect(mainSource).toMatch(/register\(\s*target\.manifestPath/);
});
