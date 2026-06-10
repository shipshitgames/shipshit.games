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
