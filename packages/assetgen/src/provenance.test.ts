import assert from "node:assert/strict";
import { test } from "node:test";

import { buildProvenance, promptHash, shortHash, styleSuffixHash } from "./provenance";

test("shortHash is a stable 16-hex sha256 prefix", () => {
  assert.match(shortHash("a husk"), /^[0-9a-f]{16}$/);
  assert.equal(shortHash("a husk"), shortHash("a husk"));
  assert.notEqual(shortHash("a husk"), shortHash("a HUSK"));
  // promptHash/styleSuffixHash are just labelled shortHash calls.
  assert.equal(promptHash("a husk"), shortHash("a husk"));
  assert.equal(styleSuffixHash("PIXEL ART"), shortHash("PIXEL ART"));
});

test("styleSuffixHash of empty string is stable and distinct from a styled suffix", () => {
  assert.match(styleSuffixHash(""), /^[0-9a-f]{16}$/);
  assert.notEqual(styleSuffixHash(""), styleSuffixHash("PIXEL ART"));
});

test("buildProvenance defaults reproducible to false and omits absent meta fields", () => {
  const provenance = buildProvenance({
    provider: "codex",
    prompt: "a husk",
    styleSuffix: "PIXEL ART",
    date: new Date("2026-06-14T09:30:00.000Z"),
  });
  assert.deepEqual(provenance, {
    provider: "codex",
    reproducible: false,
    promptHash: shortHash("a husk"),
    styleSuffixHash: shortHash("PIXEL ART"),
    date: "2026-06-14",
  });
});

test("buildProvenance threads honored seed, model, version, requestId, and input image hash", () => {
  const provenance = buildProvenance({
    provider: "fal",
    prompt: "a husk",
    styleSuffix: "PIXEL ART",
    date: "2026-06-14",
    meta: {
      model: "fal-ai/flux/dev",
      modelVersion: "1.1",
      seed: 7,
      requestId: "req-123",
      inputImageHash: "0123456789abcdef",
      reproducible: true,
    },
  });
  assert.equal(provenance.reproducible, true);
  assert.equal(provenance.seed, 7);
  assert.equal(provenance.model, "fal-ai/flux/dev");
  assert.equal(provenance.modelVersion, "1.1");
  assert.equal(provenance.requestId, "req-123");
  assert.equal(provenance.inputImageHash, "0123456789abcdef");
  assert.equal(provenance.date, "2026-06-14");
});

test("buildProvenance preserves a seed of 0 (only undefined is dropped)", () => {
  const provenance = buildProvenance({
    provider: "fal",
    prompt: "a husk",
    styleSuffix: "",
    date: "2026-06-14",
    meta: { seed: 0, reproducible: true },
  });
  assert.equal(provenance.seed, 0);
  assert.equal(provenance.reproducible, true);
});

test("buildProvenance accepts an ISO timestamp and trims it to a calendar date", () => {
  const provenance = buildProvenance({
    provider: "mock",
    prompt: "a husk",
    styleSuffix: "PIXEL ART",
    date: "2026-06-14T12:00:00.000Z",
  });
  assert.equal(provenance.date, "2026-06-14");
});
