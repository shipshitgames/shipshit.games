// Guard: the Electron main process must use assetgen's shared register() — it is
// bundled from TypeScript (vite-plugin-electron) precisely so it can import the
// one writer directly instead of shipping a CommonJS copy that drifts (issue #17).
// index.ts can't be imported here (it needs the Electron runtime), so assert on source.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const mainSource = await readFile(new URL("./index.ts", import.meta.url), "utf8");

test("main imports register from assetgen and never reimplements the writer", () => {
  // Imports the shared writer straight from assetgen's TS source (bundled in)...
  expect(mainSource).toMatch(
    /import \{[^}]*\bregister\b[^}]*\} from ["'][^"']*assetgen\/src\/manifest\.ts["']/,
  );
  // ...no private upsert and no inline license validation (name-agnostic intent guards)...
  expect(mainSource).not.toMatch(/\.assets\.findIndex/);
  expect(mainSource).not.toMatch(/license\?\.\[/);
  // ...and the audio transcode registers against the resolved project manifest path.
  expect(mainSource).toMatch(/register\(\s*target\.manifestPath/);
});
