// Integration tests that drive a real headless Chromium against the local
// fixtures. They self-skip when no browser binary is available (e.g. CI without
// `playwright install chromium`), so `bun test` stays green either way. Run
// `bun run browsers` once to enable them locally.

import { describe, expect, test } from "bun:test";
import { chromium } from "playwright";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runGameTest } from "./runner.ts";
import type { TesterOptions } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const gameUrl = pathToFileURL(join(here, "fixtures", "game.html")).href;
const blankUrl = pathToFileURL(join(here, "fixtures", "blank.html")).href;

async function probeChromium(): Promise<boolean> {
  try {
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

const hasChromium = await probeChromium();
if (!hasChromium) {
  console.warn("game-tester: skipping browser integration tests (run `bun run browsers` to enable)");
}

// Browser launch + navigation easily exceeds bun's 5s default per-test timeout.
const BROWSER_TEST_TIMEOUT = 30_000;

function baseOptions(url: string, outDir: string, overrides: Partial<TesterOptions> = {}): TesterOptions {
  return {
    url,
    ready: { kind: "flag", path: "__GAME_READY__" },
    readyTimeoutMs: 5000,
    canvasSelector: "#scene",
    script: { steps: [] },
    observeMs: 150,
    frames: 0,
    outDir,
    checkBlank: true,
    blank: { fillRatio: 0.005, uniqueColors: 2 },
    viewport: { width: 480, height: 320 },
    navTimeoutMs: 10000,
    headed: false,
    reportJsonPath: join(outDir, "report.json"),
    reportMarkdownPath: join(outDir, "report.md"),
    ...overrides,
  };
}

describe("runGameTest (browser integration)", () => {
  test.skipIf(!hasChromium)("passes on a rendering fixture and runs the input script", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "game-tester-"));
    try {
      const options = baseOptions(gameUrl, outDir, {
        script: {
          steps: [
            { type: "press", key: "Space" },
            { type: "hold", key: "ArrowRight", ms: 150 },
            { type: "screenshot", name: "mid" },
          ],
        },
      });
      const report = await runGameTest(options);

      expect(report.ready.ok).toBe(true);
      expect(report.canvas.found).toBe(true);
      expect(report.canvas.stats?.blank).toBe(false);
      expect(report.steps.every((step) => step.ok)).toBe(true);
      expect(report.pageErrors).toHaveLength(0);
      expect(report.pass).toBe(true);
      // mid + final screenshots written to the deterministic folder.
      expect(report.screenshots.map((shot) => shot.name)).toContain("mid");
      expect(report.screenshots.map((shot) => shot.name)).toContain("final");

      const onDisk = JSON.parse(await readFile(options.reportJsonPath, "utf8")) as { pass: boolean };
      expect(onDisk.pass).toBe(true);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, BROWSER_TEST_TIMEOUT);

  test.skipIf(!hasChromium)("fails on a blank canvas", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "game-tester-"));
    try {
      const report = await runGameTest(baseOptions(blankUrl, outDir));
      expect(report.ready.ok).toBe(true);
      expect(report.canvas.found).toBe(true);
      expect(report.canvas.stats?.blank).toBe(true);
      expect(report.pass).toBe(false);
      expect(report.failures).toContain("canvas rendered blank");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, BROWSER_TEST_TIMEOUT);

  test.skipIf(!hasChromium)("fails when the ready signal never fires", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "game-tester-"));
    try {
      const report = await runGameTest(
        baseOptions(gameUrl, outDir, { ready: { kind: "flag", path: "__NEVER_READY__" }, readyTimeoutMs: 800 }),
      );
      expect(report.ready.ok).toBe(false);
      expect(report.pass).toBe(false);
      expect(report.failures.some((failure) => failure.includes("game-ready signal not detected"))).toBe(true);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, BROWSER_TEST_TIMEOUT);
});
