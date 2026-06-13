import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));

async function runCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "src/cli.ts", "maps", ...args], {
    cwd: pkgDir,
    env: { ...process.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

test("e2e: maps writes a typed module and an svg preview, then --check passes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-maps-e2e-"));
  try {
    const out = join(dir, "data", "maps.ts");
    const svg = join(dir, "preview.svg");
    const args = ["--id", "breach-alpha", "--rooms", "6", "--levels", "2", "--seed", "7", "--out", out, "--svg", svg];

    const result = await runCli(args);
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assert.match(result.stdout, /\[maps\] wrote .*maps\.ts/);

    assert.equal(existsSync(out), true, "module not written");
    const moduleText = await readFile(out, "utf8");
    assert.match(moduleText, /import type \{ ArenaMap \} from "@shipshitgames\/engine";/);
    assert.match(moduleText, /export const breachAlphaMap: ArenaMap =/);
    assert.match(moduleText, /export default breachAlphaMap;/);

    assert.equal(existsSync(svg), true, "svg not written");
    const svgText = await readFile(svg, "utf8");
    assert.ok(svgText.startsWith("<svg"), "svg missing <svg> root");
    assert.ok(svgText.includes("</svg>"), "svg missing closing tag");

    // --check on the freshly-written file is a no-op success.
    const check = await runCli([...args, "--check"]);
    assert.equal(check.exitCode, 0, `--check should pass\nstderr:\n${check.stderr}`);
    assert.match(check.stdout, /\[maps\] up to date/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: maps is deterministic for a given seed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-maps-e2e-det-"));
  try {
    const a = join(dir, "a.ts");
    const b = join(dir, "b.ts");
    await runCli(["--id", "breach-alpha", "--rooms", "4", "--seed", "11", "--out", a]);
    await runCli(["--id", "breach-alpha", "--rooms", "4", "--seed", "11", "--out", b]);
    assert.equal(await readFile(a, "utf8"), await readFile(b, "utf8"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: --check fails when the committed module is stale", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-maps-e2e-stale-"));
  try {
    const out = join(dir, "maps.ts");
    await runCli(["--id", "breach-alpha", "--rooms", "4", "--seed", "1", "--out", out]);
    // A different seed produces a different layout → --check must fail.
    const check = await runCli(["--id", "breach-alpha", "--rooms", "4", "--seed", "2", "--out", out, "--check"]);
    assert.equal(check.exitCode, 1);
    assert.match(check.stderr, /out of date/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: --check without --out exits 1 with a clear message", async () => {
  const result = await runCli(["--id", "breach-alpha", "--rooms", "4", "--check"]);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /--check requires --out/);
});

test("e2e: --check against a missing module exits 1 and the hint carries the generation flags", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-maps-e2e-missing-"));
  try {
    const out = join(dir, "data", "maps.ts");
    const check = await runCli(["--id", "breach-alpha", "--rooms", "6", "--seed", "7", "--out", out, "--check"]);
    assert.equal(check.exitCode, 1);
    assert.match(check.stderr, /no map module at/);
    // The re-run hint must echo the actual flags so a CI operator reproduces the
    // exact module rather than silently regenerating with defaults.
    assert.match(check.stderr, /--rooms 6/);
    assert.match(check.stderr, /--seed 7/);
    assert.equal(existsSync(out), false, "a --check failure must not write the module");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: an explicitly-supplied invalid flag exits 1 instead of silently using the default", async () => {
  const result = await runCli(["--id", "breach-alpha", "--rooms", "0"]);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /invalid --rooms/);
});

test("e2e: maps prints the module to stdout when no --out is given", async () => {
  const result = await runCli(["--id", "solo", "--rooms", "1", "--seed", "1"]);
  assert.equal(result.exitCode, 0, `cli failed\nstderr:\n${result.stderr}`);
  assert.match(result.stdout, /export const soloMap: ArenaMap =/);
});

test("e2e: maps exits 1 when --id is missing", async () => {
  const result = await runCli(["--rooms", "4"]);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /--id .* is required/);
});

test("e2e: maps exits 1 on an unknown preset", async () => {
  const result = await runCli(["--id", "x", "--preset", "nope"]);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /unknown --preset/);
});
