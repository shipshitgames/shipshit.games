import { test, expect } from "bun:test";

import { DEFAULTS, DEFAULT_PROVIDER_BY_KIND, normalizeSettings } from "./settings";

test("applies full defaults to an empty settings object", () => {
  expect(normalizeSettings({})).toEqual({
    defaultProvider: "codex",
    defaultGame: "scourge-survivors",
    providerDefaults: { ...DEFAULT_PROVIDER_BY_KIND },
    activeProjectId: "",
    projects: [],
    falModelDefaults: {},
  });
  expect(DEFAULTS.falModelDefaults).toEqual({});
});

test("invalid providers fall back to the per-kind default", () => {
  const s = normalizeSettings({
    defaultProvider: "midjourney",
    providerDefaults: { sprite: "dall-e", texture: "fal" },
  });
  expect(s.defaultProvider).toBe("codex");
  expect(s.providerDefaults.sprite).toBe(DEFAULT_PROVIDER_BY_KIND.sprite);
  expect(s.providerDefaults.texture).toBe("fal");
});

test("falModelDefaults: non-object values normalize to {}", () => {
  expect(normalizeSettings({ falModelDefaults: "fal-ai/flux/dev" }).falModelDefaults).toEqual({});
  expect(normalizeSettings({ falModelDefaults: ["fal-ai/flux/dev"] }).falModelDefaults).toEqual({});
  expect(normalizeSettings({ falModelDefaults: null }).falModelDefaults).toEqual({});
  expect(normalizeSettings({ falModelDefaults: 7 }).falModelDefaults).toEqual({});
});

test("falModelDefaults: keeps only fal image kinds with non-empty trimmed string values", () => {
  const s = normalizeSettings({
    falModelDefaults: {
      sprite: "  fal-ai/flux/schnell  ", // trimmed
      texture: "my-org/custom-texture-model", // BYO custom id, not in the catalog
      music: "fal-ai/flux/dev", // not a fal image kind
      icon: "   ", // whitespace-only
      map: 7, // not a string
    },
  });
  expect(s.falModelDefaults).toEqual({
    sprite: "fal-ai/flux/schnell",
    texture: "my-org/custom-texture-model",
  });
});
