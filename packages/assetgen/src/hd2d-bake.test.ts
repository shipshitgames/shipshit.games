import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GAME_HD2D_BAKE_PRESET,
  HD2D_BAKE_PRESETS,
  HD2D_BAKE_VIEWS_4,
  buildHd2dBakePlan,
  serializeHd2dBakePlan,
  validateHd2dBakeManifest,
  type Hd2dBakeManifest,
  type Hd2dBakeViolationCode,
} from "./hd2d-bake.ts";

function manifest(): Hd2dBakeManifest {
  return {
    schemaVersion: 1,
    id: "scourge-ripper",
    game: "scourge-survivors",
    sourceModel: {
      path: "models/scourge-ripper.optimized.glb",
      sha256: "a".repeat(64),
      provider: "replicate",
      model: "tencent/hunyuan-3d-3.1",
      generatedAt: "2026-07-21T20:00:00Z",
      license: {
        tool: "replicate",
        plan: "developer",
        date: "2026-07-21",
        kind: "model",
      },
    },
    preset: "fps-billboard",
    output: { root: "drafts/hd2d", width: 128, height: 128, format: "webp" },
    views: [
      { id: "south", yawDegrees: 0 },
      { id: "north", yawDegrees: 180 },
    ],
    actions: [
      {
        id: "idle",
        sourceClip: "Idle",
        frames: 2,
        fps: 8,
        loop: true,
        pivot: [0.5, 1],
        origin: [64, 120],
      },
      {
        id: "attack",
        sourceClip: "Attack",
        frames: 3,
        fps: 12,
        loop: false,
        pivot: [0.5, 1],
        origin: [64, 120],
      },
    ],
    directionBindings: [
      { direction: "south", view: "south" },
      { direction: "north", view: "north" },
    ],
  };
}

function codes(value: unknown): Hd2dBakeViolationCode[] {
  const result = validateHd2dBakeManifest(value);
  return result.ok ? [] : result.violations.map((entry) => entry.code);
}

test("camera and lighting presets cover every current game art-direction family", () => {
  assert.deepEqual(GAME_HD2D_BAKE_PRESET, {
    "scourge-survivors": "fps-billboard",
    deadlane: "top-down",
    pactfall: "isometric",
    starblight: "arcade",
    redline: "side-on",
    rothulk: "side-on",
    shared: "fps-billboard",
  });
  assert.deepEqual(Object.keys(HD2D_BAKE_PRESETS).sort(), [
    "arcade",
    "fps-billboard",
    "isometric",
    "side-on",
    "top-down",
  ]);
  for (const preset of Object.values(HD2D_BAKE_PRESETS)) {
    assert.equal(preset.camera.projection, "orthographic");
    assert.equal(preset.lighting.rim.color, "#ff6a00");
    assert.ok(preset.lighting.rim.intensity > preset.lighting.fill.intensity);
    assert.notEqual(preset.lighting.key.color, "#00ff00");
  }
  assert.deepEqual(
    HD2D_BAKE_VIEWS_4.map((view) => view.id),
    ["south", "west", "north", "east"],
  );
});

test("a valid manifest expands into deterministic clips, frame ranges, and direction bindings", () => {
  const input = manifest();
  assert.equal(validateHd2dBakeManifest(input).ok, true);

  const plan = buildHd2dBakePlan(input);
  assert.deepEqual(plan.summary, {
    actions: 2,
    views: 2,
    clips: 4,
    frames: 10,
  });
  assert.deepEqual(
    plan.clips.map((clip) => clip.id),
    ["attack.north", "attack.south", "idle.north", "idle.south"],
  );
  assert.deepEqual(
    plan.clips.map((clip) => clip.frameRange),
    [
      { start: 0, endInclusive: 2 },
      { start: 3, endInclusive: 5 },
      { start: 6, endInclusive: 7 },
      { start: 8, endInclusive: 9 },
    ],
  );
  assert.deepEqual(plan.clips[0]!.pivot, [0.5, 1]);
  assert.deepEqual(plan.clips[0]!.origin, [64, 120]);
  assert.equal(plan.clips[0]!.fps, 12);
  assert.equal(plan.directionToClip.attack!.north, "attack.north");
  assert.equal(plan.directionToClip.attack!.south, "attack.south");
  assert.equal(plan.jobs[0]!.sampleTimeSeconds, 0);
  assert.equal(plan.jobs[1]!.sampleTimeSeconds, 1 / 12);
  assert.equal(
    plan.jobs[0]!.outputPath,
    "drafts/hd2d/scourge-ripper/attack/attack.north.000.webp",
  );
  assert.equal(plan.jobs.at(-1)!.order, 9);
});

test("planning is canonical when actions, views, and bindings arrive in another order", () => {
  const a = manifest();
  const b = manifest();
  b.actions.reverse();
  b.views.reverse();
  b.directionBindings.reverse();

  assert.deepEqual(buildHd2dBakePlan(a), buildHd2dBakePlan(b));
  const serialized = serializeHd2dBakePlan(buildHd2dBakePlan(a));
  assert.ok(serialized.endsWith("\n"));
  assert.equal(JSON.parse(serialized).summary.frames, 10);
});

test("planning uses code-point ordering instead of environment locale collation", () => {
  const input = manifest();
  input.actions.push({
    ...input.actions[0]!,
    id: "a-z",
    sourceClip: null,
  });
  input.actions.push({
    ...input.actions[0]!,
    id: "aa",
    sourceClip: "Alternate",
  });

  const plan = buildHd2dBakePlan(input);
  assert.deepEqual(
    [...new Set(plan.clips.map((clip) => clip.action))],
    ["a-z", "aa", "attack", "idle"],
  );
});

test("runtime validation rejects unsafe paths, incomplete provenance, and bad timing", () => {
  const unsafeSource = manifest();
  unsafeSource.sourceModel.path = "../secrets/model.glb";
  assert.ok(codes(unsafeSource).includes("unsafe-path"));

  const unsafeOutput = manifest();
  unsafeOutput.output.root = "/tmp/bake";
  assert.ok(codes(unsafeOutput).includes("unsafe-path"));

  const noLicense = manifest();
  noLicense.sourceModel.license.plan = " ";
  assert.ok(codes(noLicense).includes("incomplete-provenance"));

  const badTiming = manifest();
  badTiming.actions[0]!.fps = 0;
  badTiming.actions[0]!.frames = 0;
  assert.equal(
    codes(badTiming).filter((code) => code === "invalid-action").length,
    2,
  );
});

test("runtime validation rejects duplicate and incomplete runtime bindings", () => {
  const duplicateAction = manifest();
  duplicateAction.actions.push({ ...duplicateAction.actions[0]! });
  assert.ok(codes(duplicateAction).includes("duplicate-action"));

  const duplicateView = manifest();
  duplicateView.views.push({ ...duplicateView.views[0]! });
  assert.ok(codes(duplicateView).includes("duplicate-view"));

  const duplicateDirection = manifest();
  duplicateDirection.directionBindings.push({
    direction: "north",
    view: "south",
  });
  assert.ok(codes(duplicateDirection).includes("duplicate-direction-binding"));

  const unknownView = manifest();
  unknownView.directionBindings[0]!.view = "missing";
  const invalidCodes = codes(unknownView);
  assert.ok(invalidCodes.includes("unknown-bound-view"));
  assert.ok(invalidCodes.includes("unbound-view"));
});

test("current games cannot silently select the wrong camera family", () => {
  const input = manifest();
  input.preset = "side-on";
  assert.ok(codes(input).includes("preset-game-mismatch"));
  assert.throws(
    () => buildHd2dBakePlan(input),
    /preset-game-mismatch at preset/,
  );
});

test("prototype properties are not accepted as preset ids", () => {
  const input = manifest();
  input.game = "custom-game";
  (input as unknown as { preset: string }).preset = "toString";
  assert.ok(codes(input).includes("invalid-preset"));
});

test("origins must lie inside the output frame and hashes must be complete", () => {
  const input = manifest();
  input.actions[0]!.origin = [200, 120];
  input.sourceModel.sha256 = "abc";
  const result = validateHd2dBakeManifest(input);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.violations.some((entry) => entry.path === "actions[0].origin"),
    );
    assert.ok(
      result.violations.some((entry) => entry.path === "sourceModel.sha256"),
    );
  }
});
