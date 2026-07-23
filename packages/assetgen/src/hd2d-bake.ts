/**
 * Renderer-agnostic HD-2D bake contract and deterministic frame planner (#372).
 *
 * Later pipeline stages own GLB loading, animation sampling, pixel readback,
 * pixelization, and pack persistence. This module is deliberately pure: it
 * validates the handoff between those stages and expands one manifest into a
 * stable action × view × frame worklist plus runtime animation bindings.
 */

import type { AssetLicenseRecord } from "./manifest.ts";

export const HD2D_BAKE_MANIFEST_VERSION = 1;
export const HD2D_BAKE_PLAN_VERSION = 1;

export type Hd2dBakeVector2 = [number, number];
export type Hd2dBakeVector3 = [number, number, number];

export interface Hd2dBakeLight {
  color: string;
  intensity: number;
  position?: Hd2dBakeVector3;
}

export interface Hd2dBakeCameraPreset {
  projection: "orthographic";
  position: Hd2dBakeVector3;
  target: Hd2dBakeVector3;
  orthographicSize: number;
}

export interface Hd2dBakePreset {
  camera: Hd2dBakeCameraPreset;
  lighting: {
    ambient: Hd2dBakeLight;
    key: Hd2dBakeLight;
    fill: Hd2dBakeLight;
    rim: Hd2dBakeLight;
  };
}

const HELLFIRE_LIGHTING: Hd2dBakePreset["lighting"] = {
  ambient: { color: "#1a1512", intensity: 0.55 },
  key: { color: "#e8dcc4", intensity: 1.1, position: [2.5, 4, 3] },
  fill: { color: "#7a0f14", intensity: 0.45, position: [-3, 1.5, 2] },
  rim: { color: "#ff6a00", intensity: 1.35, position: [-2, 3, -3] },
};

/** Camera/read families mirrored from the canonical assetgen game framing. */
export const HD2D_BAKE_PRESETS = {
  "fps-billboard": {
    camera: {
      projection: "orthographic",
      position: [0, 1.2, 4.6],
      target: [0, 1.2, 0],
      orthographicSize: 2.8,
    },
    lighting: HELLFIRE_LIGHTING,
  },
  "top-down": {
    camera: {
      projection: "orthographic",
      position: [0, 5.5, 3.25],
      target: [0, 0.75, 0],
      orthographicSize: 4.2,
    },
    lighting: HELLFIRE_LIGHTING,
  },
  isometric: {
    camera: {
      projection: "orthographic",
      position: [4, 3.6, 4],
      target: [0, 1, 0],
      orthographicSize: 4,
    },
    lighting: HELLFIRE_LIGHTING,
  },
  arcade: {
    camera: {
      projection: "orthographic",
      position: [0, 4.25, 4],
      target: [0, 0.6, 0],
      orthographicSize: 4.4,
    },
    lighting: HELLFIRE_LIGHTING,
  },
  "side-on": {
    camera: {
      projection: "orthographic",
      position: [4.6, 1.25, 0],
      target: [0, 1.25, 0],
      orthographicSize: 3.2,
    },
    lighting: HELLFIRE_LIGHTING,
  },
} as const satisfies Record<string, Hd2dBakePreset>;

export type Hd2dBakePresetId = keyof typeof HD2D_BAKE_PRESETS;

/** Default preset for every current Deadrot game art-direction family. */
export const GAME_HD2D_BAKE_PRESET = {
  "scourge-survivors": "fps-billboard",
  deadlane: "top-down",
  pactfall: "isometric",
  starblight: "arcade",
  redline: "side-on",
  rothulk: "side-on",
  shared: "fps-billboard",
} as const satisfies Record<string, Hd2dBakePresetId>;

/** Canonical four-view turntable order: front, side, back, opposite side. */
export const HD2D_BAKE_VIEWS_4 = [
  { id: "south", yawDegrees: 0 },
  { id: "west", yawDegrees: 90 },
  { id: "north", yawDegrees: 180 },
  { id: "east", yawDegrees: 270 },
] as const;

export interface Hd2dBakeSourceModel {
  /** Relative POSIX path to the optimized GLB in the selected project. */
  path: string;
  sha256: string;
  provider: string;
  model: string;
  generatedAt: string;
  license: AssetLicenseRecord;
}

export interface Hd2dBakeOutput {
  /** Relative POSIX directory; the planner appends manifest/action/frame paths. */
  root: string;
  width: number;
  height: number;
  format: "webp";
}

export interface Hd2dBakeView {
  id: string;
  yawDegrees: number;
}

export interface Hd2dBakeAction {
  id: string;
  /** Explicit GLB clip name. A later pose stage may interpret null as a static/procedural pose. */
  sourceClip: string | null;
  frames: number;
  fps: number;
  loop: boolean;
  /** Normalized runtime pivot in [0,1] image space. */
  pivot: Hd2dBakeVector2;
  /** Runtime origin in output-frame pixels. */
  origin: Hd2dBakeVector2;
}

export interface Hd2dBakeDirectionBinding {
  /** Runtime movement/input direction, e.g. north or south-west. */
  direction: string;
  /** View id rendered for that direction. */
  view: string;
}

export interface Hd2dBakeManifest {
  schemaVersion: typeof HD2D_BAKE_MANIFEST_VERSION;
  id: string;
  game: string;
  sourceModel: Hd2dBakeSourceModel;
  preset: Hd2dBakePresetId;
  output: Hd2dBakeOutput;
  views: Hd2dBakeView[];
  actions: Hd2dBakeAction[];
  directionBindings: Hd2dBakeDirectionBinding[];
}

export type Hd2dBakeViolationCode =
  | "malformed-manifest"
  | "unsupported-version"
  | "invalid-id"
  | "invalid-preset"
  | "preset-game-mismatch"
  | "incomplete-provenance"
  | "unsafe-path"
  | "invalid-output"
  | "invalid-action"
  | "duplicate-action"
  | "invalid-view"
  | "duplicate-view"
  | "invalid-direction-binding"
  | "duplicate-direction-binding"
  | "unknown-bound-view"
  | "unbound-view";

export interface Hd2dBakeViolation {
  code: Hd2dBakeViolationCode;
  path: string;
  message: string;
}

export type Hd2dBakeValidationResult =
  | { ok: true; manifest: Hd2dBakeManifest; violations: [] }
  | { ok: false; manifest: null; violations: Hd2dBakeViolation[] };

export interface Hd2dBakeRenderJob {
  /** Zero-based order in the canonical global frame sequence. */
  order: number;
  clipId: string;
  action: string;
  view: string;
  yawDegrees: number;
  frameIndex: number;
  sampleTimeSeconds: number;
  outputPath: string;
}

export interface Hd2dBakeClipPlan {
  id: string;
  action: string;
  view: string;
  frameRange: { start: number; endInclusive: number };
  frames: string[];
  fps: number;
  loop: boolean;
  pivot: Hd2dBakeVector2;
  origin: Hd2dBakeVector2;
}

export interface Hd2dBakePlan {
  schemaVersion: typeof HD2D_BAKE_PLAN_VERSION;
  manifestId: string;
  game: string;
  sourceModel: Hd2dBakeSourceModel;
  presetId: Hd2dBakePresetId;
  preset: Hd2dBakePreset;
  output: Hd2dBakeOutput;
  clips: Hd2dBakeClipPlan[];
  jobs: Hd2dBakeRenderJob[];
  /** action -> movement/input direction -> clip id */
  directionToClip: Record<string, Record<string, string>>;
  summary: { actions: number; views: number; clips: number; frames: number };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function slug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function finiteTuple(
  value: unknown,
  min: number,
  max: number,
): value is Hd2dBakeVector2 {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(
      (entry) =>
        typeof entry === "number" &&
        Number.isFinite(entry) &&
        entry >= min &&
        entry <= max,
    )
  );
}

function safeRelativePosixPath(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\0")
  )
    return false;
  if (value.startsWith("/") || /^[a-zA-Z]:/.test(value)) return false;
  const parts = value.split("/");
  return parts.every(
    (part) =>
      part.length > 0 &&
      part !== "." &&
      part !== ".." &&
      /^[a-zA-Z0-9._-]+$/.test(part),
  );
}

function validIsoInstant(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  );
}

function violation(
  violations: Hd2dBakeViolation[],
  code: Hd2dBakeViolationCode,
  path: string,
  message: string,
): void {
  violations.push({ code, path, message });
}

/** Runtime validation for manifests loaded from JSON or other untyped inputs. */
export function validateHd2dBakeManifest(
  value: unknown,
): Hd2dBakeValidationResult {
  const violations: Hd2dBakeViolation[] = [];
  const manifest = record(value);
  if (!manifest) {
    return {
      ok: false,
      manifest: null,
      violations: [
        {
          code: "malformed-manifest",
          path: "$",
          message: "manifest must be an object",
        },
      ],
    };
  }

  if (manifest.schemaVersion !== HD2D_BAKE_MANIFEST_VERSION) {
    violation(
      violations,
      "unsupported-version",
      "schemaVersion",
      `expected ${HD2D_BAKE_MANIFEST_VERSION}`,
    );
  }
  if (!slug(manifest.id))
    violation(violations, "invalid-id", "id", "must be a kebab-case id");
  if (!slug(manifest.game))
    violation(violations, "invalid-id", "game", "must be a kebab-case game id");

  const preset = manifest.preset;
  if (typeof preset !== "string" || !Object.hasOwn(HD2D_BAKE_PRESETS, preset)) {
    violation(
      violations,
      "invalid-preset",
      "preset",
      "must name a supported camera/lighting preset",
    );
  } else if (
    typeof manifest.game === "string" &&
    Object.hasOwn(GAME_HD2D_BAKE_PRESET, manifest.game)
  ) {
    const expected =
      GAME_HD2D_BAKE_PRESET[
        manifest.game as keyof typeof GAME_HD2D_BAKE_PRESET
      ];
    if (preset !== expected) {
      violation(
        violations,
        "preset-game-mismatch",
        "preset",
        `${manifest.game} requires preset ${expected}`,
      );
    }
  }

  const source = record(manifest.sourceModel);
  if (!source) {
    violation(
      violations,
      "incomplete-provenance",
      "sourceModel",
      "must describe the source GLB and its provenance",
    );
  } else {
    if (
      !safeRelativePosixPath(source.path) ||
      !source.path.toLowerCase().endsWith(".glb")
    ) {
      violation(
        violations,
        "unsafe-path",
        "sourceModel.path",
        "must be a relative POSIX .glb path without dot segments",
      );
    }
    if (
      typeof source.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/i.test(source.sha256)
    ) {
      violation(
        violations,
        "incomplete-provenance",
        "sourceModel.sha256",
        "must be a 64-character SHA-256 digest",
      );
    }
    if (!nonEmpty(source.provider))
      violation(
        violations,
        "incomplete-provenance",
        "sourceModel.provider",
        "is required",
      );
    if (!nonEmpty(source.model))
      violation(
        violations,
        "incomplete-provenance",
        "sourceModel.model",
        "is required",
      );
    if (!validIsoInstant(source.generatedAt)) {
      violation(
        violations,
        "incomplete-provenance",
        "sourceModel.generatedAt",
        "must be an ISO-8601 instant with timezone",
      );
    }
    const license = record(source.license);
    for (const field of ["tool", "plan", "date", "kind"] as const) {
      if (!license || !nonEmpty(license[field])) {
        violation(
          violations,
          "incomplete-provenance",
          `sourceModel.license.${field}`,
          "is required",
        );
      }
    }
  }

  const output = record(manifest.output);
  let outputWidth = 0;
  let outputHeight = 0;
  if (!output) {
    violation(
      violations,
      "invalid-output",
      "output",
      "must describe the frame output",
    );
  } else {
    if (!safeRelativePosixPath(output.root)) {
      violation(
        violations,
        "unsafe-path",
        "output.root",
        "must be a relative POSIX directory without dot segments",
      );
    }
    outputWidth = typeof output.width === "number" ? output.width : 0;
    outputHeight = typeof output.height === "number" ? output.height : 0;
    if (
      !Number.isInteger(outputWidth) ||
      outputWidth < 1 ||
      outputWidth > 4096
    ) {
      violation(
        violations,
        "invalid-output",
        "output.width",
        "must be an integer from 1 through 4096",
      );
    }
    if (
      !Number.isInteger(outputHeight) ||
      outputHeight < 1 ||
      outputHeight > 4096
    ) {
      violation(
        violations,
        "invalid-output",
        "output.height",
        "must be an integer from 1 through 4096",
      );
    }
    if (output.format !== "webp")
      violation(violations, "invalid-output", "output.format", "must be webp");
  }

  const actionIds = new Set<string>();
  if (!Array.isArray(manifest.actions) || manifest.actions.length === 0) {
    violation(
      violations,
      "invalid-action",
      "actions",
      "must contain at least one action",
    );
  } else {
    manifest.actions.forEach((raw, index) => {
      const action = record(raw);
      const path = `actions[${index}]`;
      if (!action) {
        violation(violations, "invalid-action", path, "must be an object");
        return;
      }
      if (!slug(action.id)) {
        violation(
          violations,
          "invalid-action",
          `${path}.id`,
          "must be a kebab-case id",
        );
      } else if (actionIds.has(action.id)) {
        violation(
          violations,
          "duplicate-action",
          `${path}.id`,
          `duplicate action ${action.id}`,
        );
      } else {
        actionIds.add(action.id);
      }
      if (action.sourceClip !== null && !nonEmpty(action.sourceClip)) {
        violation(
          violations,
          "invalid-action",
          `${path}.sourceClip`,
          "must be a non-empty clip name or null",
        );
      }
      if (
        !Number.isInteger(action.frames) ||
        (action.frames as number) < 1 ||
        (action.frames as number) > 1000
      ) {
        violation(
          violations,
          "invalid-action",
          `${path}.frames`,
          "must be an integer from 1 through 1000",
        );
      }
      if (
        typeof action.fps !== "number" ||
        !Number.isFinite(action.fps) ||
        action.fps <= 0 ||
        action.fps > 240
      ) {
        violation(
          violations,
          "invalid-action",
          `${path}.fps`,
          "must be greater than 0 and at most 240",
        );
      }
      if (typeof action.loop !== "boolean")
        violation(
          violations,
          "invalid-action",
          `${path}.loop`,
          "must be boolean",
        );
      if (!finiteTuple(action.pivot, 0, 1)) {
        violation(
          violations,
          "invalid-action",
          `${path}.pivot`,
          "must be a normalized [x,y] tuple",
        );
      }
      if (
        !finiteTuple(action.origin, 0, Math.max(outputWidth, outputHeight, 0))
      ) {
        violation(
          violations,
          "invalid-action",
          `${path}.origin`,
          "must be a non-negative [x,y] pixel tuple",
        );
      } else if (
        action.origin[0] > outputWidth ||
        action.origin[1] > outputHeight
      ) {
        violation(
          violations,
          "invalid-action",
          `${path}.origin`,
          "must lie within the output frame",
        );
      }
    });
  }

  const viewIds = new Set<string>();
  if (!Array.isArray(manifest.views) || manifest.views.length === 0) {
    violation(
      violations,
      "invalid-view",
      "views",
      "must contain at least one view",
    );
  } else {
    manifest.views.forEach((raw, index) => {
      const view = record(raw);
      const path = `views[${index}]`;
      if (!view) {
        violation(violations, "invalid-view", path, "must be an object");
        return;
      }
      if (!slug(view.id)) {
        violation(
          violations,
          "invalid-view",
          `${path}.id`,
          "must be a kebab-case id",
        );
      } else if (viewIds.has(view.id)) {
        violation(
          violations,
          "duplicate-view",
          `${path}.id`,
          `duplicate view ${view.id}`,
        );
      } else {
        viewIds.add(view.id);
      }
      if (
        typeof view.yawDegrees !== "number" ||
        !Number.isFinite(view.yawDegrees)
      ) {
        violation(
          violations,
          "invalid-view",
          `${path}.yawDegrees`,
          "must be finite",
        );
      }
    });
  }

  const boundDirections = new Set<string>();
  const referencedViews = new Set<string>();
  if (
    !Array.isArray(manifest.directionBindings) ||
    manifest.directionBindings.length === 0
  ) {
    violation(
      violations,
      "invalid-direction-binding",
      "directionBindings",
      "must contain at least one direction binding",
    );
  } else {
    manifest.directionBindings.forEach((raw, index) => {
      const binding = record(raw);
      const path = `directionBindings[${index}]`;
      if (!binding || !slug(binding.direction) || !slug(binding.view)) {
        violation(
          violations,
          "invalid-direction-binding",
          path,
          "must contain kebab-case direction and view ids",
        );
        return;
      }
      if (boundDirections.has(binding.direction)) {
        violation(
          violations,
          "duplicate-direction-binding",
          `${path}.direction`,
          `duplicate direction ${binding.direction}`,
        );
      }
      boundDirections.add(binding.direction);
      if (!viewIds.has(binding.view)) {
        violation(
          violations,
          "unknown-bound-view",
          `${path}.view`,
          `unknown view ${binding.view}`,
        );
      } else {
        referencedViews.add(binding.view);
      }
    });
  }
  for (const viewId of viewIds) {
    if (!referencedViews.has(viewId))
      violation(
        violations,
        "unbound-view",
        "directionBindings",
        `view ${viewId} has no runtime direction binding`,
      );
  }

  if (violations.length > 0) return { ok: false, manifest: null, violations };
  return { ok: true, manifest: value as Hd2dBakeManifest, violations: [] };
}

function clipId(action: string, view: string): string {
  return `${action}.${view}`;
}

function framePath(
  manifest: Hd2dBakeManifest,
  action: string,
  view: string,
  frameIndex: number,
): string {
  const frame = String(frameIndex).padStart(3, "0");
  return `${manifest.output.root}/${manifest.id}/${action}/${action}.${view}.${frame}.${manifest.output.format}`;
}

/** Validate and expand a manifest into a canonical, IO-free render plan. */
export function buildHd2dBakePlan(value: unknown): Hd2dBakePlan {
  const validation = validateHd2dBakeManifest(value);
  if (!validation.ok) {
    const first = validation.violations[0]!;
    throw new Error(
      `invalid HD-2D bake manifest (${first.code} at ${first.path}): ${first.message}`,
    );
  }
  const manifest = validation.manifest;
  const actions = [...manifest.actions].sort((a, b) => compareText(a.id, b.id));
  const views = [...manifest.views].sort((a, b) => compareText(a.id, b.id));
  const bindings = [...manifest.directionBindings].sort((a, b) =>
    compareText(a.direction, b.direction),
  );
  const clips: Hd2dBakeClipPlan[] = [];
  const jobs: Hd2dBakeRenderJob[] = [];
  const directionToClip: Record<string, Record<string, string>> = {};

  for (const action of actions) {
    const runtimeBindings: Record<string, string> = {};
    for (const binding of bindings)
      runtimeBindings[binding.direction] = clipId(action.id, binding.view);
    directionToClip[action.id] = runtimeBindings;

    for (const view of views) {
      const id = clipId(action.id, view.id);
      const start = jobs.length;
      const paths: string[] = [];
      for (let frameIndex = 0; frameIndex < action.frames; frameIndex++) {
        const outputPath = framePath(manifest, action.id, view.id, frameIndex);
        paths.push(outputPath);
        jobs.push({
          order: jobs.length,
          clipId: id,
          action: action.id,
          view: view.id,
          yawDegrees: view.yawDegrees,
          frameIndex,
          sampleTimeSeconds: frameIndex / action.fps,
          outputPath,
        });
      }
      clips.push({
        id,
        action: action.id,
        view: view.id,
        frameRange: { start, endInclusive: jobs.length - 1 },
        frames: paths,
        fps: action.fps,
        loop: action.loop,
        pivot: action.pivot,
        origin: action.origin,
      });
    }
  }

  return {
    schemaVersion: HD2D_BAKE_PLAN_VERSION,
    manifestId: manifest.id,
    game: manifest.game,
    sourceModel: manifest.sourceModel,
    presetId: manifest.preset,
    preset: HD2D_BAKE_PRESETS[manifest.preset],
    output: manifest.output,
    clips,
    jobs,
    directionToClip,
    summary: {
      actions: actions.length,
      views: views.length,
      clips: clips.length,
      frames: jobs.length,
    },
  };
}

/** Stable, newline-terminated JSON for future renderer/CLI handoffs. */
export function serializeHd2dBakePlan(plan: Hd2dBakePlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}
