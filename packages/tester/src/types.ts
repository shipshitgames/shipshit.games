// Public contract for the game tester. Kept dependency-free so the pure units
// (script parsing, pixel analysis, report formatting) can be unit-tested without
// a browser, and so consumers can type their own scripts and reports.

/** How the harness decides the game is ready to be driven. */
export type ReadyMode =
  /** Wait for a canvas to exist with non-zero layout size (the default). */
  | { kind: "canvas"; selector: string }
  /** Wait for any CSS selector to be attached to the DOM. */
  | { kind: "selector"; selector: string }
  /** Wait until a JS expression evaluated in the page is truthy. */
  | { kind: "expression"; expression: string }
  /** Wait until a dotted window path (e.g. `window.__GAME_READY__`) is truthy. */
  | { kind: "flag"; path: string };

/** A single scripted interaction. No app-specific logic lives here. */
export type InputStep =
  | { type: "wait"; ms: number }
  | { type: "press"; key: string }
  | { type: "keydown"; key: string }
  | { type: "keyup"; key: string }
  | { type: "hold"; key: string; ms: number }
  | { type: "tap"; x: number; y: number }
  | { type: "click"; selector: string }
  | { type: "screenshot"; name: string };

export interface InputScript {
  steps: InputStep[];
}

export interface Viewport {
  width: number;
  height: number;
}

export interface BlankThresholds {
  /** Considered blank when the non-background pixel fraction is below this. */
  fillRatio: number;
  /** Considered blank when the distinct (quantized) color count is at or below this. */
  uniqueColors: number;
}

export interface TesterOptions {
  /** Page to open. Accepts http(s):// or file:// URLs. */
  url: string;
  ready: ReadyMode;
  readyTimeoutMs: number;
  /** Canvas the harness samples + screenshots for blank detection. */
  canvasSelector: string;
  script: InputScript;
  /** Time to keep the page running after the script finishes, before the final sample. */
  observeMs: number;
  /** Evenly-spaced screenshots captured during the observe window (0 = none). */
  frames: number;
  /** Deterministic output folder for screenshots + report files. */
  outDir: string;
  /** Fail the run when the final canvas reads as blank. */
  checkBlank: boolean;
  blank: BlankThresholds;
  viewport: Viewport;
  navTimeoutMs: number;
  /** Timeout (ms) for `click` steps that target a selector. */
  clickTimeoutMs: number;
  /** Run a headed browser (default headless). */
  headed: boolean;
  /** Browser channel to launch (e.g. "chrome"); "" uses the Playwright-managed chromium. */
  channel: string;
  /** When set, write the JSON report here (defaults to <outDir>/report.json). */
  reportJsonPath: string;
  /** When set, write the Markdown report here (defaults to <outDir>/report.md). */
  reportMarkdownPath: string;
}

export interface PixelStats {
  /** Sampled (downscaled) dimensions the stats were computed over. */
  sampleWidth: number;
  sampleHeight: number;
  /** Fraction of pixels that differ from the dominant background color (0..1). */
  fillRatio: number;
  /** Distinct quantized colors observed (transparent counts as one bucket). */
  uniqueColors: number;
  /** Mean alpha-weighted luma (0..255). */
  meanLuma: number;
  /** Variance of alpha-weighted luma. */
  variance: number;
  blank: boolean;
}

export interface StepResult {
  index: number;
  step: InputStep;
  ok: boolean;
  error?: string;
}

export interface ScreenshotResult {
  name: string;
  path: string;
  atMs: number;
}

export interface ReadyResult {
  ok: boolean;
  /** Human-readable description of the ready mode that was used. */
  mode: string;
  waitedMs: number;
  error?: string;
}

export interface CanvasResult {
  found: boolean;
  selector: string;
  /** Intrinsic canvas pixel dimensions as reported by the page. */
  width: number;
  height: number;
  stats?: PixelStats;
}

export interface GameTestReport {
  url: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  ready: ReadyResult;
  canvas: CanvasResult;
  steps: StepResult[];
  screenshots: ScreenshotResult[];
  consoleErrors: string[];
  pageErrors: string[];
  pass: boolean;
  /** Human-readable reasons the run failed (empty when pass === true). */
  failures: string[];
}

export const DEFAULT_BLANK_THRESHOLDS: BlankThresholds = {
  fillRatio: 0.005,
  uniqueColors: 2,
};
