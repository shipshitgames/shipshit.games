// Browser orchestration. The only module that talks to Playwright. It keeps no
// app-specific knowledge: everything is driven by TesterOptions, so the same
// runner tests any canvas/WebGL game by URL.

import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { analyzePixels } from "./pixels.ts";
import { writeReports } from "./report-files.ts";
import { sanitizeName } from "./script.ts";
import type {
  CanvasResult,
  GameTestReport,
  InputStep,
  ReadyMode,
  ReadyResult,
  ScreenshotResult,
  StepResult,
  TesterOptions,
} from "./types.ts";

/** Edge length the canvas is downscaled to before pixel analysis. */
const SAMPLE_SIZE = 48;

interface CanvasSample {
  found: boolean;
  intrinsicWidth: number;
  intrinsicHeight: number;
  sampleWidth: number;
  sampleHeight: number;
  data: number[];
}

function describeReadyMode(mode: ReadyMode): string {
  switch (mode.kind) {
    case "canvas":
      return `canvas:${mode.selector}`;
    case "selector":
      return `selector:${mode.selector}`;
    case "expression":
      return `expr:${mode.expression}`;
    case "flag":
      return `flag:${mode.path}`;
    default: {
      const exhaustive: never = mode;
      return String(exhaustive);
    }
  }
}

async function waitForReady(page: Page, mode: ReadyMode, timeoutMs: number): Promise<void> {
  switch (mode.kind) {
    case "canvas":
      await page.waitForFunction(
        (selector) => {
          const el = document.querySelector(selector);
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        },
        mode.selector,
        { timeout: timeoutMs },
      );
      return;
    case "selector":
      await page.waitForSelector(mode.selector, { state: "attached", timeout: timeoutMs });
      return;
    case "expression":
      await page.waitForFunction(mode.expression, undefined, { timeout: timeoutMs });
      return;
    case "flag": {
      const path = mode.path.startsWith("window.") ? mode.path : `window.${mode.path}`;
      await page.waitForFunction(`Boolean(${path})`, undefined, { timeout: timeoutMs });
      return;
    }
    default: {
      const exhaustive: never = mode;
      throw new Error(`unhandled ready mode ${JSON.stringify(exhaustive)}`);
    }
  }
}

async function runStep(
  page: Page,
  step: InputStep,
  shoot: (name: string) => Promise<void>,
  clickTimeoutMs: number,
): Promise<void> {
  switch (step.type) {
    case "wait":
      await page.waitForTimeout(step.ms);
      return;
    case "press":
      await page.keyboard.press(step.key);
      return;
    case "keydown":
      await page.keyboard.down(step.key);
      return;
    case "keyup":
      await page.keyboard.up(step.key);
      return;
    case "hold":
      await page.keyboard.down(step.key);
      await page.waitForTimeout(step.ms);
      await page.keyboard.up(step.key);
      return;
    case "tap":
      await page.mouse.click(step.x, step.y);
      return;
    case "click":
      await page.click(step.selector, { timeout: clickTimeoutMs });
      return;
    case "screenshot":
      await shoot(step.name);
      return;
    default: {
      const exhaustive: never = step;
      throw new Error(`unhandled step ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Downscale the canvas in-page and return a flat RGBA buffer for analysis. */
async function sampleCanvas(page: Page, selector: string, sampleSize: number): Promise<CanvasSample> {
  return page.evaluate(
    ({ selector, sampleSize }): CanvasSample => {
      const empty: CanvasSample = {
        found: false,
        intrinsicWidth: 0,
        intrinsicHeight: 0,
        sampleWidth: 0,
        sampleHeight: 0,
        data: [],
      };
      const el = document.querySelector(selector);
      if (!(el instanceof HTMLCanvasElement)) return empty;
      const intrinsicWidth = el.width || el.clientWidth || 0;
      const intrinsicHeight = el.height || el.clientHeight || 0;
      const sw = Math.max(1, Math.min(sampleSize, intrinsicWidth || sampleSize));
      const sh = Math.max(1, Math.min(sampleSize, intrinsicHeight || sampleSize));
      const off = document.createElement("canvas");
      off.width = sw;
      off.height = sh;
      const ctx = off.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        return { found: true, intrinsicWidth, intrinsicHeight, sampleWidth: 0, sampleHeight: 0, data: [] };
      }
      try {
        ctx.drawImage(el, 0, 0, sw, sh);
      } catch {
        // A tainted or non-drawable canvas: report found-but-unsampled.
        return { found: true, intrinsicWidth, intrinsicHeight, sampleWidth: 0, sampleHeight: 0, data: [] };
      }
      const image = ctx.getImageData(0, 0, sw, sh);
      return {
        found: true,
        intrinsicWidth,
        intrinsicHeight,
        sampleWidth: sw,
        sampleHeight: sh,
        data: Array.from(image.data),
      };
    },
    { selector, sampleSize },
  );
}

/**
 * Open `opts.url`, wait for the game to be ready, run the input script, capture
 * screenshots, sample the canvas for blank detection, and return a report. Never
 * throws for in-page failures — they surface as `pass: false` + `failures`.
 */
export async function runGameTest(opts: TesterOptions): Promise<GameTestReport> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const steps: StepResult[] = [];
  const screenshots: ScreenshotResult[] = [];

  let browser: Browser | undefined;
  let page: Page | undefined;
  let ready: ReadyResult = { ok: false, mode: describeReadyMode(opts.ready), waitedMs: 0 };
  let canvas: CanvasResult = { found: false, selector: opts.canvasSelector, width: 0, height: 0 };

  const elapsed = (): number => Date.now() - startedAtMs;
  // Track emitted names so distinct steps whose names sanitize to the same
  // string don't silently overwrite each other's screenshot file.
  const usedNames = new Set<string>();
  const shoot = async (rawName: string): Promise<void> => {
    if (!page) return;
    let name = sanitizeName(rawName);
    if (usedNames.has(name)) {
      let n = 2;
      while (usedNames.has(`${name}-${n}`)) n++;
      name = `${name}-${n}`;
    }
    usedNames.add(name);
    const path = join(opts.outDir, `${name}.png`);
    try {
      await page.screenshot({ path });
      screenshots.push({ name, path, atMs: elapsed() });
    } catch (error) {
      consoleErrors.push(`screenshot "${name}" failed: ${(error as Error).message}`);
    }
  };

  try {
    await mkdir(opts.outDir, { recursive: true });
    browser = await chromium.launch({
      headless: !opts.headed,
      ...(opts.channel ? { channel: opts.channel } : {}),
    });
    const context = await browser.newContext({ viewport: opts.viewport });
    page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(opts.url, { timeout: opts.navTimeoutMs, waitUntil: "load" });

    const readyStart = Date.now();
    try {
      await waitForReady(page, opts.ready, opts.readyTimeoutMs);
      ready = { ok: true, mode: describeReadyMode(opts.ready), waitedMs: Date.now() - readyStart };
    } catch (error) {
      ready = {
        ok: false,
        mode: describeReadyMode(opts.ready),
        waitedMs: Date.now() - readyStart,
        error: (error as Error).message,
      };
    }

    for (let i = 0; i < opts.script.steps.length; i++) {
      const step = opts.script.steps[i];
      if (!step) continue;
      try {
        await runStep(page, step, shoot, opts.clickTimeoutMs);
        steps.push({ index: i, step, ok: true });
      } catch (error) {
        steps.push({ index: i, step, ok: false, error: (error as Error).message });
      }
    }

    if (opts.observeMs > 0) {
      const frames = Math.max(0, Math.floor(opts.frames));
      if (frames > 0) {
        const interval = opts.observeMs / frames;
        for (let f = 0; f < frames; f++) {
          await page.waitForTimeout(interval);
          await shoot(`frame-${String(f + 1).padStart(2, "0")}`);
        }
      } else {
        await page.waitForTimeout(opts.observeMs);
      }
    }

    const sample = await sampleCanvas(page, opts.canvasSelector, SAMPLE_SIZE);
    if (sample.found) {
      const stats =
        sample.data.length > 0
          ? analyzePixels(sample.data, sample.sampleWidth, sample.sampleHeight, opts.blank)
          : undefined;
      canvas = {
        found: true,
        selector: opts.canvasSelector,
        width: sample.intrinsicWidth,
        height: sample.intrinsicHeight,
        stats,
      };
    } else {
      canvas = { found: false, selector: opts.canvasSelector, width: 0, height: 0 };
    }

    await shoot("final");
  } catch (error) {
    pageErrors.push(`run aborted: ${(error as Error).message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const failures: string[] = [];
  if (!ready.ok) {
    failures.push(`game-ready signal not detected (${ready.mode})${ready.error ? `: ${ready.error}` : ""}`);
  }
  if (!canvas.found) {
    failures.push(`canvas not found (${canvas.selector})`);
  }
  if (opts.checkBlank && canvas.found && canvas.stats?.blank) {
    failures.push("canvas rendered blank");
  }
  const failedSteps = steps.filter((step) => !step.ok);
  if (failedSteps.length > 0) {
    failures.push(`${failedSteps.length} input step(s) failed`);
  }
  if (pageErrors.length > 0) {
    failures.push(`${pageErrors.length} page error(s)`);
  }

  const finishedAtMs = Date.now();
  const report: GameTestReport = {
    url: opts.url,
    startedAt,
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: finishedAtMs - startedAtMs,
    ready,
    canvas,
    steps,
    screenshots,
    consoleErrors,
    pageErrors,
    pass: failures.length === 0,
    failures,
  };

  await writeReports(report, opts);
  return report;
}
