import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const mainSource = await readFile(new URL("./index.ts", import.meta.url), "utf8");
const buildRuntimeSource = await readFile(
  new URL("../../scripts/build-tooling-runtime.ts", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(
  await readFile(new URL("../../package.json", import.meta.url), "utf8"),
);

test("main resolves one tooling runtime instead of hardcoding workspace subprocesses", () => {
  expect(mainSource).toMatch(
    /import \{[^}]*\bresolveToolingRuntime\b[^}]*\} from ["']\.\/tooling-runtime["']/,
  );
  expect(mainSource).toContain("toolingRuntime.assetgen.command");
  expect(mainSource).toContain("toolingRuntime.ressources.command");
  expect(mainSource).not.toMatch(/spawn\(\s*["']bun["']/);
  expect(mainSource).not.toContain('path.join(STUDIO_REPO, "packages", "assetgen", "src", "cli.ts")');
  expect(mainSource).not.toContain('path.join(STUDIO_REPO, "packages", "ressources", "src", "cli.ts")');
});

test("electron-builder ships the generated runtime outside ASAR", () => {
  expect(packageJson.scripts["build:runtime"]).toContain("build-tooling-runtime.ts");
  expect(packageJson.scripts["package:mac"]).toContain("build:runtime");
  expect(packageJson.build.extraResources).toEqual([
    {
      from: ".runtime",
      to: "tooling-runtime",
      filter: ["**/*"],
    },
  ]);
});

test("isolated runtime installs dependencies for every bundled workspace tool", () => {
  for (const packagePath of [
    "packages/assetgen/package.json",
    "packages/ressources/package.json",
    "packages/tester/package.json",
  ]) {
    expect(buildRuntimeSource).toContain(`packageJson("${packagePath}")`);
  }
  expect(buildRuntimeSource).toContain(
    "Object.keys(ressources.dependencies ?? {})",
  );
});
