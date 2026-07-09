// Parsing + validation for input scripts. Pure and browser-free so it can be
// unit-tested directly. Accepts either `{ "steps": [...] }` or a bare `[...]`.

import type { InputScript, InputStep } from "./types.ts";

export class ScriptError extends Error {
  override name = "ScriptError";
}

const STEP_TYPES = new Set([
  "wait",
  "press",
  "keydown",
  "keyup",
  "hold",
  "tap",
  "click",
  "screenshot",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, where: string, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ScriptError(`${where}: "${field}" must be a non-empty string`);
  }
  return value;
}

function requireFiniteNumber(value: unknown, where: string, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ScriptError(`${where}: "${field}" must be a finite number`);
  }
  return value;
}

function requireNonNegative(value: unknown, where: string, field: string): number {
  const n = requireFiniteNumber(value, where, field);
  if (n < 0) {
    throw new ScriptError(`${where}: "${field}" must be >= 0`);
  }
  return n;
}

function parseStep(raw: unknown, index: number): InputStep {
  const where = `step[${index}]`;
  if (!isRecord(raw)) {
    throw new ScriptError(`${where} must be an object`);
  }
  const type = raw["type"];
  if (typeof type !== "string" || !STEP_TYPES.has(type)) {
    throw new ScriptError(
      `${where}: unknown step type ${JSON.stringify(type)} (expected one of ${[...STEP_TYPES].join(", ")})`,
    );
  }
  switch (type) {
    case "wait":
      return { type, ms: requireNonNegative(raw["ms"], where, "ms") };
    case "press":
    case "keydown":
    case "keyup":
      return { type, key: requireString(raw["key"], where, "key") };
    case "hold":
      return {
        type,
        key: requireString(raw["key"], where, "key"),
        ms: requireNonNegative(raw["ms"], where, "ms"),
      };
    case "tap":
      return {
        type,
        x: requireFiniteNumber(raw["x"], where, "x"),
        y: requireFiniteNumber(raw["y"], where, "y"),
      };
    case "click":
      return { type, selector: requireString(raw["selector"], where, "selector") };
    case "screenshot":
      return { type, name: sanitizeName(requireString(raw["name"], where, "name")) };
    default:
      // Exhaustive: STEP_TYPES is the single source of truth for valid types.
      throw new ScriptError(`${where}: unhandled step type ${JSON.stringify(type)}`);
  }
}

export function parseInputScript(raw: unknown): InputScript {
  const rawSteps = Array.isArray(raw) ? raw : isRecord(raw) ? raw["steps"] : undefined;
  if (!Array.isArray(rawSteps)) {
    throw new ScriptError('script must be an array of steps or an object with a "steps" array');
  }
  return { steps: rawSteps.map((step, index) => parseStep(step, index)) };
}

export function parseScriptJson(text: string): InputScript {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ScriptError(`script is not valid JSON: ${(error as Error).message}`);
  }
  return parseInputScript(parsed);
}

/** "ArrowUp,Space, KeyW" -> three `press` steps (whitespace + empty entries ignored). */
export function parsePresses(spec: string): InputStep[] {
  return spec
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0)
    .map((key) => ({ type: "press", key }));
}

/** "ArrowRight:1200" -> a `hold` step. */
export function parseHold(spec: string): InputStep {
  const sep = spec.lastIndexOf(":");
  if (sep <= 0 || sep === spec.length - 1) {
    throw new ScriptError(`invalid --hold "${spec}" (expected "<key>:<ms>")`);
  }
  const key = spec.slice(0, sep).trim();
  const msText = spec.slice(sep + 1).trim();
  const ms = Number(msText);
  if (key.length === 0) {
    throw new ScriptError(`invalid --hold "${spec}": missing key`);
  }
  if (!Number.isFinite(ms) || ms < 0) {
    throw new ScriptError(`invalid --hold "${spec}": ms must be a number >= 0`);
  }
  return { type: "hold", key, ms };
}

/** Keep screenshot names filesystem-safe and deterministic. */
export function sanitizeName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
  return cleaned.length > 0 ? cleaned : "screenshot";
}
