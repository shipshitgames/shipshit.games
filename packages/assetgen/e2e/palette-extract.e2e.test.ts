import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));

// The winged-host palette: a bruised-purple flyer. Magenta clashes with it
// (~95, in palette); green is far (~239, out of palette).
const VIOLET_PALETTE = "#c020c0,#a030b0,#c1121f,#e9e3d6,#161214";

type CheckReport = {
  ok: boolean;
  matte: { hex: string };
  key: string;
  safety: { ok: boolean; nearestHex: string | null; distance: number };
  residual: number;
  violations: Array<{ code: string; message: string }>;
};

type Sidecar = {
  keyColor: string;
  keyName: string;
  keyReason: string;
  keySafe: boolean;
  nearestSubjectHex: string | null;
  dimensions: [number, number];
  candidates: Array<{ name: string; safe: boolean }>;
};

async function runCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "src/cli.ts", "palette-extract", ...args], {
    cwd: pkgDir,
    env: { ...process.env, SHIPSHIT_ASSETGEN_USAGE_LOG: "off" },
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

/** A filled-square `subject` (violet by default) on a flat `matte` background, as a PNG file. */
async function writeFixture(
  dir: string,
  name: string,
  matte: { r: number; g: number; b: number },
  subject: { r: number; g: number; b: number } = { r: 192, g: 32, b: 192 },
): Promise<string> {
  const size = 64;
  const subjectBuf = await sharp({
    create: { width: 28, height: 28, channels: 4, background: { ...subject, alpha: 1 } },
  })
    .png()
    .toBuffer();
  const path = join(dir, name);
  await sharp({ create: { width: size, height: size, channels: 4, background: { ...matte, alpha: 1 } } })
    .composite([{ input: subjectBuf, left: 18, top: 18 }])
    .png()
    .toFile(path);
  return path;
}

test("e2e: --check fails on an unsafe magenta matte and passes on an out-of-palette green matte", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-palette-extract-"));
  try {
    const magenta = await writeFixture(dir, "flyer-magenta.png", { r: 255, g: 0, b: 255 });
    const green = await writeFixture(dir, "flyer-green.png", { r: 0, g: 255, b: 0 });

    // AC1: violet subject on a magenta matte fails validation.
    const bad = await runCli(["--check", "--in", magenta, "--palette-hex", VIOLET_PALETTE, "--json"]);
    assert.equal(bad.exitCode, 1, `expected failure\nstdout:\n${bad.stdout}\nstderr:\n${bad.stderr}`);
    const badReport = JSON.parse(bad.stdout) as CheckReport;
    assert.equal(badReport.ok, false);
    assert.equal(badReport.matte.hex, "#ff00ff");
    assert.ok(
      badReport.violations.some((v) => v.code === "unsafe-key"),
      `expected an unsafe-key violation, got ${JSON.stringify(badReport.violations)}`,
    );
    assert.equal(badReport.safety.ok, false);

    // Human (non-JSON) path: FAIL on stdout, summary on stderr, non-zero exit.
    const badHuman = await runCli(["--check", "--in", magenta, "--palette-hex", VIOLET_PALETTE]);
    assert.equal(badHuman.exitCode, 1);
    assert.match(badHuman.stdout, /FAIL/);
    assert.match(badHuman.stderr, /not palette-safe/);

    // AC2: the same subject re-keyed on an out-of-palette green matte passes.
    const good = await runCli(["--check", "--in", green, "--palette-hex", VIOLET_PALETTE, "--json"]);
    assert.equal(good.exitCode, 0, `expected pass\nstdout:\n${good.stdout}\nstderr:\n${good.stderr}`);
    const goodReport = JSON.parse(good.stdout) as CheckReport;
    assert.equal(goodReport.ok, true);
    assert.equal(goodReport.matte.hex, "#00ff00");
    assert.equal(goodReport.safety.ok, true);
    assert.equal(goodReport.residual, 0);
    assert.deepEqual(goodReport.violations, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: extract auto-selects a safe key, writes a webp, and records the key + reason (AC3)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-palette-extract-out-"));
  try {
    const green = await writeFixture(dir, "flyer-green.png", { r: 0, g: 255, b: 0 });
    const out = join(dir, "flyer.webp");

    const res = await runCli([
      "--in", green,
      "--out", out,
      "--palette-hex", VIOLET_PALETTE,
      "--size", "128",
      "--json",
    ]);
    assert.equal(res.exitCode, 0, `extract failed\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.equal(existsSync(out), true, "expected the webp output to exist");

    const sidecarPath = `${out}.key.json`;
    assert.equal(existsSync(sidecarPath), true, "expected the .key.json sidecar to exist");
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8")) as Sidecar;

    // AC3: the selected key colour AND why it was selected are recorded.
    assert.equal(sidecar.keyColor, "#00ff00");
    assert.equal(sidecar.keyName, "green");
    assert.equal(sidecar.keySafe, true);
    assert.ok(sidecar.keyReason.length > 0, "expected a non-empty keyReason");
    // the reason must name the chosen key AND its hex (not merely mention "green")
    assert.match(sidecar.keyReason, /green/);
    assert.match(sidecar.keyReason, /#00ff00/);
    // auto-selection avoided magenta (it clashes with the violet palette)
    assert.equal(sidecar.candidates.find((c) => c.name === "magenta")?.safe, false);

    // The webp is a real 128×128 stable plate with a transparent corner.
    const decoded = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(decoded.info.width, 128);
    assert.equal(decoded.info.height, 128);
    assert.equal(decoded.data[3], 0, "expected a transparent top-left corner");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: a toxic-green subject forces selection off the green default (PRD fallback)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-palette-extract-toxic-"));
  try {
    // A Scourge creature that uses toxic green as a SUBJECT colour, rendered on
    // the correct out-of-palette magenta matte. Green must NOT be chosen.
    const TOXIC = "#22ff22,#5a9a18,#2c5410,#e9e3d6,#161214";
    const fixture = await writeFixture(dir, "scourge.png", { r: 255, g: 0, b: 255 }, { r: 34, g: 255, b: 34 });
    const out = join(dir, "scourge.webp");

    const res = await runCli(["--in", fixture, "--out", out, "--palette-hex", TOXIC, "--json"]);
    assert.equal(res.exitCode, 0, `extract failed\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`);

    const sidecar = JSON.parse(await readFile(`${out}.key.json`, "utf8")) as Sidecar;
    assert.notEqual(sidecar.keyName, "green");
    assert.equal(sidecar.keyName, "magenta"); // first safe candidate after green
    assert.equal(sidecar.keySafe, true);
    // green is recorded as a rejected (unsafe) candidate, and the reason says so.
    assert.equal(sidecar.candidates.find((c) => c.name === "green")?.safe, false);
    assert.match(sidecar.keyReason, /green/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: extract refuses an in-palette key unless --force", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-palette-extract-force-"));
  try {
    const magenta = await writeFixture(dir, "flyer-magenta.png", { r: 255, g: 0, b: 255 });
    const out = join(dir, "flyer.webp");

    // magenta is in-palette for a violet subject -> refused.
    const refused = await runCli(["--in", magenta, "--out", out, "--palette-hex", VIOLET_PALETTE, "--key", "magenta"]);
    assert.equal(refused.exitCode, 1);
    assert.match(refused.stderr, /in-palette key|--force/);
    assert.equal(existsSync(out), false, "must not write output when refusing");

    // --force overrides and emits the file plus an unsafe sidecar.
    const forced = await runCli([
      "--in", magenta,
      "--out", out,
      "--palette-hex", VIOLET_PALETTE,
      "--key", "magenta",
      "--force",
      "--json",
    ]);
    assert.equal(forced.exitCode, 0, `forced extract failed\nstdout:\n${forced.stdout}\nstderr:\n${forced.stderr}`);
    assert.equal(existsSync(out), true);
    const sidecar = JSON.parse(await readFile(`${out}.key.json`, "utf8")) as Sidecar;
    assert.equal(sidecar.keyColor, "#ff00ff");
    assert.equal(sidecar.keySafe, false);
    // the recorded reason explains WHY it is unsafe (distance under the bar / residue risk)
    assert.match(sidecar.keyReason, /< 110|risks|residue/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
