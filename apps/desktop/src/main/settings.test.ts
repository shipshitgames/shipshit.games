import { test, expect } from "bun:test";

import { DEFAULTS, DEFAULT_PROVIDER_BY_KIND, normalizeSettings, providerForKind } from "./settings";

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

test("providerForKind falls back to the per-kind default with no explicit override", () => {
  expect(providerForKind(normalizeSettings({}), "sprite")).toBe("codex");
  // music/sfx/voice keep defaulting to suno (the pipeline default must not move).
  expect(providerForKind(normalizeSettings({}), "music")).toBe("suno");
  expect(providerForKind(normalizeSettings({}), "sfx")).toBe("suno");
});

// #194: the desktop tables had drifted from assetgen's canonical catalog and
// were missing sprite-anim, so it fell through to the generic codex fallback by
// accident. Now that the catalog is the single source of truth, sprite-anim is
// an explicit codex route — pin it so the reconciliation can't silently regress.
test("sprite-anim routes to codex from the shared catalog (was missing from the drifted copy)", () => {
  // Load-bearing guards: both were `undefined` on the old drifted copy and would fail it.
  expect(DEFAULT_PROVIDER_BY_KIND["sprite-anim"]).toBe("codex");
  expect(normalizeSettings({}).providerDefaults["sprite-anim"]).toBe("codex");
  // Documents the resolved routing. (Bug-invariant on its own — the old code also
  // returned "codex" here, via the defaultProvider fallback rather than an explicit
  // route — so it's the two assertions above that actually catch the regression.)
  expect(providerForKind(normalizeSettings({}), "sprite-anim")).toBe("codex");
});

test("providerForKind accepts the new audio providers as explicit choices", () => {
  expect(providerForKind(normalizeSettings({}), "sfx", "elevenlabs")).toBe("elevenlabs");
  expect(providerForKind(normalizeSettings({}), "music", "beatoven")).toBe("beatoven");
});

test("providerForKind ignores an unknown explicit provider and uses the per-kind default", () => {
  expect(providerForKind(normalizeSettings({}), "music", "udio")).toBe("suno");
});

test("3D model kinds default to replicate and accept meshy/tripo as explicit choices", () => {
  expect(providerForKind(normalizeSettings({}), "model")).toBe("replicate");
  expect(providerForKind(normalizeSettings({}), "3d")).toBe("replicate");
  expect(providerForKind(normalizeSettings({}), "model", "tripo")).toBe("tripo");
  expect(providerForKind(normalizeSettings({}), "model", "meshy")).toBe("meshy");
});
