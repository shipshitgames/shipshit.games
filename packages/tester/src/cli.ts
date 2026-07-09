#!/usr/bin/env bun
// tester CLI. Hand-rolled arg parsing to match the other studio CLIs
// (assetgen, ressources). No app-specific logic: it drives any game by URL.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { runGameTest } from "./runner.ts";
import { summarizeReport } from "./report.ts";
import { parseHold, parsePresses, parseScriptJson, sanitizeName } from "./script.ts";
import { DEFAULT_BLANK_THRESHOLDS, type InputStep, type ReadyMode, type TesterOptions } from "./types.ts";

const USAGE = `tester — browser QA harness for canvas/WebGL games

Usage:
  tester --url <url> [options]

Ready signal (default: canvas):
  --ready <spec>        canvas | selector:<css> | expr:<js> | flag:<window.path>
  --ready-timeout <ms>  default 15000

Input (used when --script is not given, applied in the order written):
  --script <path|->     JSON input script ({ "steps": [...] } or [...]); "-" reads stdin
  --press <keys>        comma-separated keys pressed once ready (e.g. "ArrowUp,Space")
  --hold <key:ms>       hold a key for ms (repeatable)
  --shot <name>         capture a named screenshot (repeatable)

Canvas + verdict:
  --canvas <css>        canvas selector to sample/screenshot (default "canvas")
  --no-check-blank      do not fail when the canvas reads as blank
  --blank-fill <ratio>  blank when non-background fill ratio < ratio (default ${DEFAULT_BLANK_THRESHOLDS.fillRatio})
  --blank-colors <n>    blank when distinct colors <= n (default ${DEFAULT_BLANK_THRESHOLDS.uniqueColors})

Run:
  --observe <ms>        keep running after the script before sampling (default 2000)
  --frames <n>          evenly-spaced screenshots during the observe window (default 0)
  --viewport <WxH>      default 1280x720
  --nav-timeout <ms>    navigation timeout (default 30000)
  --click-timeout <ms>  timeout for click steps (default 5000)
  --headed              run a headed browser (default headless)

Output:
  --out <dir>           deterministic output folder (default "game-test-output")
  --report-json <path>  JSON report path (default <out>/report.json)
  --report-md <path>    Markdown report path (default <out>/report.md)
  --json                print the JSON report to stdout
  -h, --help            show this help

Exit code is 0 when the run passes, 1 when it fails.`;

export interface RawArgs {
  values: Map<string, string>;
  flags: Set<string>;
  /** Ordered inline input actions (--press / --hold / --shot). */
  inlineSteps: InputStep[];
}

const BOOLEAN_FLAGS = new Set(["headed", "no-check-blank", "json", "help", "h"]);
const VALUE_KEYS = new Set([
  "url",
  "ready",
  "ready-timeout",
  "canvas",
  "script",
  "observe",
  "frames",
  "out",
  "blank-fill",
  "blank-colors",
  "viewport",
  "nav-timeout",
  "click-timeout",
  "report-json",
  "report-md",
]);

export function parseArgs(argv: string[]): RawArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const inlineSteps: InputStep[] = [];
  const booleanFlags = BOOLEAN_FLAGS;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token || !token.startsWith("--") && token !== "-h") {
      throw new Error(`unexpected argument: ${token}`);
    }
    const isShortHelp = token === "-h";
    const body = isShortHelp ? "h" : token.slice(2);
    const eq = body.indexOf("=");
    const key = eq >= 0 ? body.slice(0, eq) : body;
    const inlineValue = eq >= 0 ? body.slice(eq + 1) : undefined;

    if (booleanFlags.has(key)) {
      flags.add(key);
      continue;
    }

    const value = inlineValue ?? argv[++i];
    if (value === undefined) {
      throw new Error(`missing value for --${key}`);
    }

    switch (key) {
      case "press":
        inlineSteps.push(...parsePresses(value));
        break;
      case "hold":
        inlineSteps.push(parseHold(value));
        break;
      case "shot":
        inlineSteps.push({ type: "screenshot", name: sanitizeName(value) });
        break;
      default:
        if (!VALUE_KEYS.has(key)) throw new Error(`unknown option --${key}`);
        values.set(key, value);
    }
  }

  return { values, flags, inlineSteps };
}

export function parseReadySpec(spec: string, canvasSelector: string): ReadyMode {
  if (spec === "canvas") return { kind: "canvas", selector: canvasSelector };
  const idx = spec.indexOf(":");
  if (idx > 0) {
    const kind = spec.slice(0, idx);
    const rest = spec.slice(idx + 1);
    if (kind === "canvas") return { kind: "canvas", selector: rest || canvasSelector };
    if (kind === "selector" && rest) return { kind: "selector", selector: rest };
    if (kind === "expr" && rest) return { kind: "expression", expression: rest };
    if (kind === "flag" && rest) return { kind: "flag", path: rest };
  }
  throw new Error(`invalid --ready "${spec}" (expected canvas | selector:<css> | expr:<js> | flag:<path>)`);
}

export function parseViewport(spec: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/.exec(spec.trim());
  if (!match) throw new Error(`invalid --viewport "${spec}" (expected WxH, e.g. 1280x720)`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function numberOption(values: Map<string, string>, key: string, fallback: number): number {
  const raw = values.get(key);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`--${key} must be a number >= 0 (got "${raw}")`);
  return n;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function buildOptions(args: RawArgs): Promise<TesterOptions> {
  const { values, flags, inlineSteps } = args;
  const url = values.get("url");
  if (!url) throw new Error("missing required --url");

  const canvasSelector = values.get("canvas") ?? "canvas";
  const readySpec = values.get("ready");
  const ready = readySpec
    ? parseReadySpec(readySpec, canvasSelector)
    : ({ kind: "canvas", selector: canvasSelector } satisfies ReadyMode);

  const scriptArg = values.get("script");
  let steps: InputStep[] = inlineSteps;
  if (scriptArg) {
    if (inlineSteps.length > 0) {
      console.warn("warning: --script overrides --press/--hold/--shot");
    }
    const text = scriptArg === "-" ? await readStdin() : await readFile(scriptArg, "utf8");
    steps = parseScriptJson(text).steps;
  }

  const outDir = values.get("out") ?? "game-test-output";

  return {
    url,
    ready,
    readyTimeoutMs: numberOption(values, "ready-timeout", 15000),
    canvasSelector,
    script: { steps },
    observeMs: numberOption(values, "observe", 2000),
    frames: numberOption(values, "frames", 0),
    outDir,
    checkBlank: !flags.has("no-check-blank"),
    blank: {
      fillRatio: numberOption(values, "blank-fill", DEFAULT_BLANK_THRESHOLDS.fillRatio),
      uniqueColors: numberOption(values, "blank-colors", DEFAULT_BLANK_THRESHOLDS.uniqueColors),
    },
    viewport: values.has("viewport") ? parseViewport(values.get("viewport")!) : { width: 1280, height: 720 },
    navTimeoutMs: numberOption(values, "nav-timeout", 30000),
    clickTimeoutMs: numberOption(values, "click-timeout", 5000),
    headed: flags.has("headed"),
    reportJsonPath: values.get("report-json") ?? join(outDir, "report.json"),
    reportMarkdownPath: values.get("report-md") ?? join(outDir, "report.md"),
  };
}

async function main(): Promise<void> {
  let args: RawArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`error: ${(error as Error).message}`);
    console.error(`\n${USAGE}`);
    process.exit(1);
  }

  if (args.flags.has("help") || args.flags.has("h") || process.argv.length <= 2) {
    console.log(USAGE);
    process.exit(args.flags.has("help") || args.flags.has("h") ? 0 : 1);
  }

  let options: TesterOptions;
  try {
    options = await buildOptions(args);
  } catch (error) {
    console.error(`error: ${(error as Error).message}`);
    process.exit(1);
  }

  const report = await runGameTest(options);
  console.log(summarizeReport(report));
  console.log(`report: ${options.reportMarkdownPath} | ${options.reportJsonPath}`);
  if (args.flags.has("json")) {
    console.log(JSON.stringify(report, null, 2));
  }
  process.exit(report.pass ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
