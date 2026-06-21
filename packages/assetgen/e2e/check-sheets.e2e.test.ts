import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import sharp from "sharp";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const RED = { r: 220, g: 20, b: 20, alpha: 1 };
const BLUE = { r: 20, g: 70, b: 220, alpha: 1 };

type CheckReport = {
  ok: boolean;
  reports: Array<{
    ok: boolean;
    width: number;
    height: number;
    columns: number;
    cells: Array<{ bounds: { centerDrift: number; width: number; height: number } | null }>;
    violations: Array<{ code: string; cell?: number }>;
  }>;
};

type NormalizeReport = {
  ok: boolean;
  wrote: boolean;
  before: { width: number; height: number; columns: number };
  after: { width: number; height: number; columns: number } | null;
  cells: Array<{ changed: boolean; after: { bounds: { centerDrift: number } | null } | null }>;
};

async function runCli(verb: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "src/cli.ts", verb, ...args], {
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

async function rect(width: number, height: number, color = RED): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: color } }).png().toBuffer();
}

async function writeSheet(
  path: string,
  opts: {
    columns: number;
    cellWidth: number;
    cellHeight: number;
    cells: Array<{ index: number; left: number; top: number; width: number; height: number; color?: typeof RED }>;
  },
): Promise<void> {
  const overlays = await Promise.all(
    opts.cells.map(async (cell) => ({
      input: await rect(cell.width, cell.height, cell.color ?? RED),
      left: cell.index * opts.cellWidth + cell.left,
      top: cell.top,
    })),
  );
  await writeFile(
    path,
    await sharp({
      create: {
        width: opts.columns * opts.cellWidth,
        height: opts.cellHeight,
        channels: 4,
        background: TRANSPARENT,
      },
    })
      .composite(overlays)
      .png()
      .toBuffer(),
  );
}

test("e2e: normalize-sheet recenters a horizontal tier sheet and check-sheets accepts it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-checksheets-e2e-"));
  try {
    const input = join(dir, "weapon-tiers.png");
    const output = join(dir, "weapon-tiers-normalized.webp");
    await writeSheet(input, {
      columns: 3,
      cellWidth: 32,
      cellHeight: 24,
      cells: [
        { index: 0, left: 1, top: 3, width: 10, height: 8 },
        { index: 1, left: 11, top: 8, width: 10, height: 8, color: BLUE },
        { index: 2, left: 20, top: 13, width: 10, height: 8 },
      ],
    });

    const originalCheck = await runCli("check-sheets", ["--in", input, "--columns", "3", "--json", "--max-bounds-delta", "0", "--max-aspect-delta", "0"]);
    assert.equal(originalCheck.exitCode, 1);
    const originalParsed = JSON.parse(originalCheck.stdout) as CheckReport;
    assert.equal(originalParsed.ok, false);
    assert.ok(originalParsed.reports[0]!.violations.some((violation) => violation.code === "center-drift"));

    const normalize = await runCli("normalize-sheet", [
      "--in",
      input,
      "--out",
      output,
      "--columns",
      "3",
      "--json",
      "--max-bounds-delta",
      "0",
      "--max-aspect-delta",
      "0",
    ]);
    assert.equal(normalize.exitCode, 0, `normalize failed\nstdout:\n${normalize.stdout}\nstderr:\n${normalize.stderr}`);
    assert.equal(existsSync(output), true);
    const normalizedParsed = JSON.parse(normalize.stdout) as NormalizeReport;
    assert.equal(normalizedParsed.ok, true);
    assert.equal(normalizedParsed.wrote, true);
    assert.equal(normalizedParsed.before.width, 96);
    assert.equal(normalizedParsed.before.height, 24);
    assert.equal(normalizedParsed.before.columns, 3);
    assert.equal(normalizedParsed.after?.width, 96);
    assert.equal(normalizedParsed.after?.height, 24);
    assert.equal(normalizedParsed.after?.columns, 3);
    assert.equal(normalizedParsed.cells.some((cell) => cell.changed), true);
    assert.ok(normalizedParsed.cells.every((cell) => (cell.after?.bounds?.centerDrift ?? Infinity) <= 1));

    const meta = await sharp(await readFile(output)).metadata();
    assert.equal(meta.width, 96);
    assert.equal(meta.height, 24);
    assert.equal(meta.format, "webp");

    const normalizedCheck = await runCli("check-sheets", ["--in", output, "--columns", "3", "--json", "--max-bounds-delta", "0", "--max-aspect-delta", "0"]);
    assert.equal(normalizedCheck.exitCode, 0, `normalized check failed\nstdout:\n${normalizedCheck.stdout}\nstderr:\n${normalizedCheck.stderr}`);
    const checkParsed = JSON.parse(normalizedCheck.stdout) as CheckReport;
    assert.equal(checkParsed.ok, true);
    assert.equal(checkParsed.reports[0]!.width, 96);
    assert.equal(checkParsed.reports[0]!.height, 24);
    assert.equal(checkParsed.reports[0]!.columns, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: check-sheets reports blank and invalid geometry failures as JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-checksheets-fail-"));
  try {
    const blank = join(dir, "blank-cell.png");
    await writeSheet(blank, {
      columns: 2,
      cellWidth: 16,
      cellHeight: 16,
      cells: [{ index: 0, left: 4, top: 4, width: 8, height: 8 }],
    });

    const blankCheck = await runCli("check-sheets", ["--in", blank, "--columns", "2", "--json"]);
    assert.equal(blankCheck.exitCode, 1);
    const blankParsed = JSON.parse(blankCheck.stdout) as CheckReport;
    assert.equal(blankParsed.ok, false);
    assert.ok(blankParsed.reports[0]!.violations.some((violation) => violation.code === "blank-cell" && violation.cell === 1));

    const invalid = await runCli("check-sheets", ["--in", blank, "--columns", "3", "--json"]);
    assert.equal(invalid.exitCode, 1);
    const invalidParsed = JSON.parse(invalid.stdout) as CheckReport;
    assert.deepEqual(
      invalidParsed.reports[0]!.violations.map((violation) => violation.code),
      ["invalid-geometry"],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: normalize-sheet --cell-size repairs invalid source width into canonical dimensions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-checksheets-canonical-"));
  try {
    const input = join(dir, "bad-width.png");
    const output = join(dir, "fixed-width.webp");
    await writeSheet(input, {
      columns: 3,
      cellWidth: 32,
      cellHeight: 24,
      cells: [
        { index: 0, left: 12, top: 8, width: 8, height: 8 },
        { index: 1, left: 12, top: 8, width: 8, height: 8, color: BLUE },
        { index: 2, left: 12, top: 8, width: 8, height: 8 },
      ],
    });
    const cropped = await sharp(input).extract({ left: 0, top: 0, width: 95, height: 24 }).png().toBuffer();
    await writeFile(input, cropped);

    const invalidCheck = await runCli("check-sheets", ["--in", input, "--columns", "3", "--cell-size", "32x24", "--json"]);
    assert.equal(invalidCheck.exitCode, 1);
    const invalidParsed = JSON.parse(invalidCheck.stdout) as CheckReport;
    assert.deepEqual(
      invalidParsed.reports[0]!.violations.map((violation) => violation.code),
      ["invalid-geometry", "dimension-mismatch"],
    );

    const normalize = await runCli("normalize-sheet", [
      "--in",
      input,
      "--out",
      output,
      "--columns",
      "3",
      "--cell-size",
      "32x24",
      "--json",
      "--max-bounds-delta",
      "0",
      "--max-aspect-delta",
      "0",
    ]);
    assert.equal(normalize.exitCode, 0, `normalize failed\nstdout:\n${normalize.stdout}\nstderr:\n${normalize.stderr}`);
    const meta = await sharp(await readFile(output)).metadata();
    assert.equal(meta.width, 96);
    assert.equal(meta.height, 24);

    const fixedCheck = await runCli("check-sheets", ["--in", output, "--columns", "3", "--cell-size", "32x24", "--json", "--max-bounds-delta", "0", "--max-aspect-delta", "0"]);
    assert.equal(fixedCheck.exitCode, 0, `fixed check failed\nstdout:\n${fixedCheck.stdout}\nstderr:\n${fixedCheck.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
