import { test, expect } from "bun:test";

import { buildGenerateArgs } from "./generate-args";
import { normalizeSettings } from "./settings";

const ASSETGEN = "/studio/packages/assetgen/src/cli.ts";
const TARGET = { slug: "scourge-survivors", repoPath: "/games/scourge-survivors" };

test("baseline args replicate the studio:generate spawn contract", () => {
  const { args, provider, game, kind, repo, model } = buildGenerateArgs({
    assetgenPath: ASSETGEN,
    settings: normalizeSettings({}),
    opts: {
      id: "swarm-husk",
      prompt: "a husk",
      kind: "sprite",
      views: "front,side,back",
      frames: 4,
      fps: 8,
      anchor: "0.5,1",
      scale: 1.5,
      license: "ai-generated",
      licenseUrl: "https://example.com/license",
    },
    target: TARGET,
  });
  expect({ provider, game, kind, repo, model }).toEqual({
    provider: "codex",
    game: "scourge-survivors",
    kind: "sprite",
    repo: "/games/scourge-survivors",
    model: "",
  });
  expect(args).toEqual([
    ASSETGEN,
    "--provider", "codex",
    "--game", "scourge-survivors",
    "--kind", "sprite",
    "--id", "swarm-husk",
    "--prompt", "a husk",
    "--repo", "/games/scourge-survivors",
    "--views", "front,side,back",
    "--frames", "4",
    "--fps", "8",
    "--anchor", "0.5,1",
    "--scale", "1.5",
    "--license", "ai-generated",
    "--license-url", "https://example.com/license",
  ]);
});

test("optional flags are omitted when opts leaves them unset", () => {
  const { args } = buildGenerateArgs({
    assetgenPath: ASSETGEN,
    settings: normalizeSettings({}),
    opts: {},
    target: TARGET,
  });
  expect(args).toEqual([
    ASSETGEN,
    "--provider", "codex",
    "--game", "scourge-survivors",
    "--kind", "sprite",
    "--id", "asset",
    "--prompt", "",
    "--repo", "/games/scourge-survivors",
  ]);
});

test("--model comes from falModelDefaults when the provider resolves to fal", () => {
  const settings = normalizeSettings({
    providerDefaults: { sprite: "fal" },
    falModelDefaults: { sprite: "fal-ai/flux/schnell" },
  });
  const viaKindDefault = buildGenerateArgs({ assetgenPath: ASSETGEN, settings, opts: { kind: "sprite" }, target: TARGET });
  expect(viaKindDefault.provider).toBe("fal");
  expect(viaKindDefault.model).toBe("fal-ai/flux/schnell");
  expect(viaKindDefault.args.slice(-2)).toEqual(["--model", "fal-ai/flux/schnell"]);

  // Explicit opts.provider resolving to fal picks up the kind default too.
  const viaExplicitProvider = buildGenerateArgs({
    assetgenPath: ASSETGEN,
    settings: normalizeSettings({ falModelDefaults: { texture: "fal-ai/flux-pro/v1.1" } }),
    opts: { kind: "texture", provider: "fal" },
    target: TARGET,
  });
  expect(viaExplicitProvider.model).toBe("fal-ai/flux-pro/v1.1");
  expect(viaExplicitProvider.args.slice(-2)).toEqual(["--model", "fal-ai/flux-pro/v1.1"]);
});

test("explicit opts.model wins over the falModelDefaults entry", () => {
  const settings = normalizeSettings({
    providerDefaults: { texture: "fal" },
    falModelDefaults: { texture: "fal-ai/flux/dev" },
  });
  const { args, model } = buildGenerateArgs({
    assetgenPath: ASSETGEN,
    settings,
    opts: { kind: "texture", model: "fal-ai/flux-pro/v1.1" },
    target: TARGET,
  });
  expect(model).toBe("fal-ai/flux-pro/v1.1");
  expect(args.slice(-2)).toEqual(["--model", "fal-ai/flux-pro/v1.1"]);
});

test("non-fal providers never inherit a model from falModelDefaults", () => {
  const settings = normalizeSettings({ falModelDefaults: { sprite: "fal-ai/flux/schnell" } });
  const { args, model } = buildGenerateArgs({
    assetgenPath: ASSETGEN,
    settings,
    opts: { kind: "sprite", provider: "codex" },
    target: TARGET,
  });
  expect(model).toBe("");
  expect(args).not.toContain("--model");
});

test("audio opts append --category/--volume/--no-loop/--bitrate/--normalize", () => {
  const { args } = buildGenerateArgs({
    assetgenPath: ASSETGEN,
    settings: normalizeSettings({}),
    opts: {
      id: "impact-hit",
      prompt: "a brutal metallic impact",
      kind: "sfx",
      provider: "elevenlabs",
      category: "sfx",
      volume: 0.8,
      loop: false,
      bitrate: 96,
      normalize: true,
    },
    target: TARGET,
  });
  expect(args.slice(args.indexOf("--category"))).toEqual([
    "--category", "sfx",
    "--volume", "0.8",
    "--no-loop",
    "--bitrate", "96",
    "--normalize",
  ]);
});

test("loop:true emits --loop (not --no-loop)", () => {
  const { args } = buildGenerateArgs({
    assetgenPath: ASSETGEN,
    settings: normalizeSettings({}),
    opts: { id: "theme", prompt: "a loop", kind: "music", provider: "beatoven", category: "music", loop: true },
    target: TARGET,
  });
  expect(args).toContain("--loop");
  expect(args).not.toContain("--no-loop");
});

test("absent audio opts add none of the audio flags (sprite args stay byte-identical)", () => {
  const { args } = buildGenerateArgs({
    assetgenPath: ASSETGEN,
    settings: normalizeSettings({}),
    opts: { id: "swarm-husk", prompt: "a husk", kind: "sprite" },
    target: TARGET,
  });
  expect(args).toEqual([
    ASSETGEN,
    "--provider", "codex",
    "--game", "scourge-survivors",
    "--kind", "sprite",
    "--id", "swarm-husk",
    "--prompt", "a husk",
    "--repo", "/games/scourge-survivors",
  ]);
  for (const flag of ["--category", "--volume", "--loop", "--no-loop", "--bitrate", "--normalize"]) {
    expect(args).not.toContain(flag);
  }
});

test("provenance opts append --seed/--authored/--edit-kind (issue #55)", () => {
  const { args } = buildGenerateArgs({
    assetgenPath: ASSETGEN,
    settings: normalizeSettings({}),
    opts: { id: "warden-husk", prompt: "a husk", kind: "sprite", seed: 42, authored: true, editKind: "recolor" },
    target: TARGET,
  });
  expect(args.slice(args.indexOf("--seed"))).toEqual([
    "--seed", "42",
    "--authored",
    "--edit-kind", "recolor",
  ]);
});

test("a seed of 0 is still emitted (only null/empty are skipped)", () => {
  const { args } = buildGenerateArgs({
    assetgenPath: ASSETGEN,
    settings: normalizeSettings({}),
    opts: { kind: "sprite", seed: 0 },
    target: TARGET,
  });
  expect(args.slice(args.indexOf("--seed"), args.indexOf("--seed") + 2)).toEqual(["--seed", "0"]);
});

test("--model stays last even when provenance flags are present", () => {
  const settings = normalizeSettings({ providerDefaults: { sprite: "fal" }, falModelDefaults: { sprite: "fal-ai/flux/dev" } });
  const { args } = buildGenerateArgs({
    assetgenPath: ASSETGEN,
    settings,
    opts: { kind: "sprite", seed: 7, authored: true },
    target: TARGET,
  });
  expect(args.slice(-2)).toEqual(["--model", "fal-ai/flux/dev"]);
});

test("absent provenance opts add none of the seed/authored/edit-kind flags", () => {
  const { args } = buildGenerateArgs({
    assetgenPath: ASSETGEN,
    settings: normalizeSettings({}),
    opts: { id: "swarm-husk", prompt: "a husk", kind: "sprite" },
    target: TARGET,
  });
  for (const flag of ["--seed", "--authored", "--edit-kind"]) {
    expect(args).not.toContain(flag);
  }
});

test("model opts append --ktx2/--no-draco/--rig only when present", () => {
  const { args, provider, kind } = buildGenerateArgs({
    assetgenPath: ASSETGEN,
    settings: normalizeSettings({}),
    opts: { id: "golem", prompt: "a stone golem", kind: "model", ktx2: true, draco: false, rig: "mixamo" },
    target: TARGET,
  });
  expect({ provider, kind }).toEqual({ provider: "replicate", kind: "model" });
  expect(args.slice(args.indexOf("--ktx2"))).toEqual(["--ktx2", "--no-draco", "--rig", "mixamo"]);
});

test("Hunyuan model options map to assetgen flags", () => {
  const { args } = buildGenerateArgs({
    assetgenPath: ASSETGEN,
    settings: normalizeSettings({}),
    opts: {
      id: "golem",
      prompt: "a stone golem",
      kind: "model",
      referenceImage: "/concepts/golem.png",
      faceCount: 120000,
      pbr: false,
      generateType: "Geometry",
      maxRuntimeMb: 12,
    },
    target: { ...TARGET, assetsDir: "/ip/packages/assets" },
  });
  expect(args).toContain("--assets-dir");
  expect(args.slice(args.indexOf("--reference"))).toEqual([
    "--reference",
    "/concepts/golem.png",
    "--face-count",
    "120000",
    "--no-pbr",
    "--generate-type",
    "Geometry",
    "--max-runtime-mb",
    "12",
  ]);
});

test("draco defaults on for models (no --no-draco unless explicitly disabled)", () => {
  const { args } = buildGenerateArgs({
    assetgenPath: ASSETGEN,
    settings: normalizeSettings({}),
    opts: { id: "golem", prompt: "a stone golem", kind: "model" },
    target: TARGET,
  });
  for (const flag of ["--ktx2", "--no-draco", "--rig"]) expect(args).not.toContain(flag);
});

test("volume of 0 is still emitted (only null/empty are skipped)", () => {
  const { args } = buildGenerateArgs({
    assetgenPath: ASSETGEN,
    settings: normalizeSettings({}),
    opts: { kind: "sfx", category: "sfx", volume: 0 },
    target: TARGET,
  });
  expect(args.slice(args.indexOf("--volume"), args.indexOf("--volume") + 2)).toEqual(["--volume", "0"]);
});
