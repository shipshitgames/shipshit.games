import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_FAL_MODEL, FAL_IMAGE_KINDS, FAL_MODELS } from "./fal";
import {
  AUDIO_KINDS,
  DEFAULT_PROVIDER_BY_KIND,
  IMAGE_KINDS,
  MODEL_KINDS,
  PROVIDER_CATALOG,
  defaultProviderForKind,
  providerSupportsKind,
} from "./provider-catalog";
import type { ProviderId } from "./provider-catalog";

// These pin the contract of the extracted, dependency-free catalog — the single
// source of truth the desktop copies had drifted from (#194). They run without
// touching providers.ts's heavy generate chain (sharp / node-pty / codex), which
// is the whole point of the split: the catalog is verifiable in isolation.

test("sprite-anim routes to codex — the kind the desktop copies had dropped", () => {
  assert.equal(DEFAULT_PROVIDER_BY_KIND["sprite-anim"], "codex");
  assert.equal(defaultProviderForKind("sprite-anim"), "codex");
});

test("defaultProviderForKind falls back to codex for unknown kinds", () => {
  assert.equal(defaultProviderForKind("totally-made-up"), "codex");
});

test("every catalog entry's id matches its key (no copy/paste id drift)", () => {
  for (const [id, descriptor] of Object.entries(PROVIDER_CATALOG)) {
    assert.equal(descriptor.id, id, `${id} descriptor.id mismatch`);
  }
});

test("every routing target is a real provider that supports the routed kind", () => {
  for (const [kind, providerId] of Object.entries(DEFAULT_PROVIDER_BY_KIND)) {
    const provider = PROVIDER_CATALOG[providerId];
    assert.ok(provider, `${kind} routes to unknown provider ${providerId}`);
    assert.ok(
      providerSupportsKind(provider, kind),
      `${providerId} is the default for ${kind} but does not support it`,
    );
  }
});

test("providerSupportsKind honors the mock wildcard and concrete support lists", () => {
  // mock advertises "*" and renders anything (offline tests).
  assert.equal(providerSupportsKind(PROVIDER_CATALOG.mock, "sprite-anim"), true);
  assert.equal(providerSupportsKind(PROVIDER_CATALOG.mock, "music"), true);
  // fal renders every image kind including sprite-anim, but no audio.
  assert.equal(providerSupportsKind(PROVIDER_CATALOG.fal, "sprite-anim"), true);
  assert.equal(providerSupportsKind(PROVIDER_CATALOG.fal, "music"), false);
  // suno is audio-only.
  assert.equal(providerSupportsKind(PROVIDER_CATALOG.suno, "sprite"), false);
  assert.equal(providerSupportsKind(PROVIDER_CATALOG.suno, "music"), true);
});

test("kind groups cover every routed kind and IMAGE_KINDS includes sprite-anim", () => {
  // The renderer's fal-model picker keys off FAL_IMAGE_KINDS, which must match the
  // catalog's image kinds (both carry sprite-anim now).
  assert.deepEqual([...IMAGE_KINDS], [...FAL_IMAGE_KINDS]);
  assert.ok(IMAGE_KINDS.includes("sprite-anim"));
  const known = new Set<string>([...IMAGE_KINDS, ...AUDIO_KINDS, ...MODEL_KINDS]);
  for (const kind of Object.keys(DEFAULT_PROVIDER_BY_KIND)) {
    assert.ok(known.has(kind), `${kind} is routed but absent from the kind groups`);
  }
});

test("every grouped kind has an EXPLICIT route — the #194 drift class, caught generally", () => {
  // The forward direction of the check above, and the general guard for #194: every
  // kind the catalog declares must carry its own routing entry, NOT lean on
  // defaultProviderForKind's `?? "codex"` fallback. sprite-anim regressed precisely
  // because it was added to the image kinds but left out of the routing table, so it
  // silently fell back to codex with no failing test. Pin the invariant so the next
  // kind added to a group can't repeat that drift unnoticed.
  for (const kind of [...IMAGE_KINDS, ...AUDIO_KINDS, ...MODEL_KINDS]) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(DEFAULT_PROVIDER_BY_KIND, kind),
      `${kind} is a catalog kind but has no explicit route (would silently fall back to codex)`,
    );
  }
});

test("the fal descriptor carries the model catalog and its default model", () => {
  assert.equal(PROVIDER_CATALOG.fal.models, FAL_MODELS);
  assert.equal(PROVIDER_CATALOG.fal.defaultModel, DEFAULT_FAL_MODEL);
});

test("keyed providers describe a key, codex/mock do not", () => {
  const keyed: ProviderId[] = ["openai", "fal", "replicate", "meshy", "tripo", "suno", "elevenlabs", "beatoven"];
  for (const id of keyed) {
    const key = PROVIDER_CATALOG[id].key;
    assert.ok(key && key.envName && key.service && key.label, `${id} is missing a key config`);
  }
  // codex rides codex's own auth; mock is offline — neither needs a key.
  assert.equal(PROVIDER_CATALOG.codex.key, undefined);
  assert.equal(PROVIDER_CATALOG.mock.key, undefined);
});
