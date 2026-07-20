import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  isInside,
  verifyRuntimeLayout,
} = require("../../scripts/verify-packaged-tooling.cjs") as {
  isInside: (root: string, candidate: string) => boolean;
  verifyRuntimeLayout: (root: string) => {
    resourcesRoot: string;
    browsersRoot: string;
  };
};

const temps: string[] = [];

function record(root: string, file: string) {
  return {
    path: path.relative(root, file),
    bytes: fs.statSync(file).size,
    sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  };
}

function runtimeFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tooling-runtime-layout-"));
  temps.push(root);
  const binRoot = path.join(root, "bin");
  const libRoot = path.join(root, "lib");
  fs.mkdirSync(binRoot, { recursive: true });
  fs.mkdirSync(libRoot, { recursive: true });
  const runtimeExecutable = path.join(binRoot, "bun");
  fs.writeFileSync(runtimeExecutable, "#!/bin/sh\n", { mode: 0o755 });
  const toolBundles = {
    assetgen: "assetgen.js",
    "assetgen-codex-pty": "assetgen-codex-pty.cjs",
    ressources: "ressources.js",
    tester: "tester.js",
  };
  const tools = Object.entries(toolBundles).map(([name, filename]) => {
    const bundle = path.join(libRoot, filename);
    fs.writeFileSync(bundle, `console.log(${JSON.stringify(name)});\n`);
    return {
      name,
      command: path.relative(root, runtimeExecutable),
      argsPrefix: [path.relative(root, bundle)],
      bundle: record(root, bundle),
    };
  });
  const nativePaths = [
    "node_modules/@img/sharp-darwin-fixture/lib/sharp.node",
    "node_modules/node-pty/prebuilds/darwin-fixture/pty.node",
    "node_modules/node-pty/prebuilds/darwin-fixture/spawn-helper",
  ].map((relative) => path.join(root, relative));
  for (const file of nativePaths) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "fixture\n", {
      mode: file.endsWith("spawn-helper") ? 0o755 : 0o644,
    });
  }
  for (const relative of [
    "ressources/schemas",
    "ressources/sources",
    "ressources/transcripts",
    "ressources/derivatives",
    "playwright-browsers/chromium-fixture",
  ]) {
    fs.mkdirSync(path.join(root, relative), { recursive: true });
  }
  fs.writeFileSync(
    path.join(root, "manifest.json"),
    JSON.stringify({
      schemaVersion: 2,
      platform: process.platform,
      arch: process.arch,
      runtimeExecutable: record(root, runtimeExecutable),
      tools,
      nativeArtifacts: nativePaths.map((file) => record(root, file)),
      ressources: "ressources",
      playwrightBrowsers: "playwright-browsers",
    }),
  );
  return root;
}

afterEach(() => {
  while (temps.length) fs.rmSync(temps.pop()!, { recursive: true, force: true });
});

test("verifyRuntimeLayout accepts hashed executable tools and required sidecars", () => {
  const root = runtimeFixture();
  const result = verifyRuntimeLayout(root);
  expect(result.resourcesRoot).toBe(path.join(root, "ressources"));
  expect(result.browsersRoot).toBe(path.join(root, "playwright-browsers"));
});

test("verifyRuntimeLayout fails closed when a bundled tool changes after the manifest", () => {
  const root = runtimeFixture();
  fs.appendFileSync(path.join(root, "lib", "assetgen.js"), "tampered\n");
  expect(() => verifyRuntimeLayout(root)).toThrow(/hash or size mismatch/);
});

test("verifyRuntimeLayout rejects manifest directories outside the runtime root", () => {
  const root = runtimeFixture();
  const manifestPath = path.join(root, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.ressources = "..";
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  expect(() => verifyRuntimeLayout(root)).toThrow(/escapes the runtime root/);
});

test("isInside rejects sibling and traversal paths", () => {
  expect(isInside("/app/runtime", "/app/runtime/bin/tester")).toBe(true);
  expect(isInside("/app/runtime", "/app/elsewhere/tester")).toBe(false);
  expect(isInside("/app/runtime", "/app/runtime/../elsewhere/tester")).toBe(false);
});
