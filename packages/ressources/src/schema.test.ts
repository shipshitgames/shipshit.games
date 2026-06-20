import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import { collectUnsupportedKeywords, validateValue, type JsonSchema } from "./schema";
import { schemasDir } from "./paths";

const SCHEMA_FILES = ["source.schema.json", "transcript-resource.schema.json", "derivative.schema.json"];

async function loadSchema(name: string): Promise<JsonSchema> {
  return JSON.parse(await readFile(resolve(schemasDir, name), "utf8")) as JsonSchema;
}

function validSource(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    slug: "example-source",
    kind: "youtube-channel",
    title: "Example",
    url: "https://example.com",
    priority: "reference",
    status: "active",
    topics: ["graphics"],
    rights: {
      transcriptPolicy: "user-provided",
      storeRawTranscript: true,
      notes: "Cleared for storage.",
    },
    desiredOutputs: ["rule", "skill"],
    notes: ["A note."],
  };
}

test("type mismatch is reported with the expected and actual kind", () => {
  assert.deepEqual(validateValue(5, { type: "string" }, "field"), [
    "field must be of type string (got number)",
  ]);
  assert.deepEqual(validateValue("x", { type: "array" }, "field"), [
    "field must be of type array (got string)",
  ]);
  assert.deepEqual(validateValue([], { type: "object" }, "field"), [
    "field must be of type object (got array)",
  ]);
  // arrays and null are not plain objects
  assert.deepEqual(validateValue(null, { type: "object" }, "field"), [
    "field must be of type object (got null)",
  ]);
});

test("const, enum, pattern, and minLength are enforced", () => {
  assert.deepEqual(validateValue(2, { const: 1 }, "schemaVersion"), ["schemaVersion must equal 1"]);
  assert.deepEqual(validateValue(1, { const: 1 }, "schemaVersion"), []);

  assert.match(
    validateValue("podcast", { enum: ["youtube-channel", "article"] }, "kind").join(),
    /kind must be one of/,
  );
  assert.deepEqual(validateValue("article", { enum: ["youtube-channel", "article"] }, "kind"), []);

  assert.deepEqual(
    validateValue("Bad Slug", { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" }, "slug"),
    ["slug must match pattern ^[a-z0-9][a-z0-9-]*$"],
  );
  assert.deepEqual(validateValue("good-slug", { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" }, "slug"), []);

  assert.deepEqual(validateValue("", { type: "string", minLength: 1 }, "title"), [
    "title must be at least 1 character(s) long",
  ]);
});

test("required keys and additionalProperties are enforced on objects", () => {
  const schema: JsonSchema = {
    type: "object",
    required: ["a", "b"],
    properties: { a: { type: "string" }, b: { type: "string" } },
    additionalProperties: false,
  };
  const errors = validateValue({ a: "x", c: "y" }, schema, "obj");
  assert.ok(errors.includes("obj.b is required"));
  assert.ok(errors.includes("obj.c is not an allowed property"));
  assert.deepEqual(validateValue({ a: "x", b: "y" }, schema, "obj"), []);
});

test("array items are validated element by element with indexed paths", () => {
  const schema: JsonSchema = { type: "array", items: { type: "string" } };
  const errors = validateValue(["ok", 7, "fine"], schema, "topics");
  assert.deepEqual(errors, ["topics[1] must be of type string (got number)"]);

  const enumItems: JsonSchema = { type: "array", items: { enum: ["rule", "skill"] } };
  assert.match(validateValue(["rule", "bogus"], enumItems, "desiredOutputs").join(), /desiredOutputs\[1\] must be one of/);
});

test("nested object properties are validated recursively", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: {
      rights: {
        type: "object",
        required: ["status"],
        properties: { status: { enum: ["known", "unknown"] } },
        additionalProperties: false,
      },
    },
  };
  const errors = validateValue({ rights: { status: "bogus", extra: 1 } }, schema, "t");
  assert.ok(errors.some((e) => e.startsWith("t.rights.status must be one of")));
  assert.ok(errors.includes("t.rights.extra is not an allowed property"));
});

test("the real source schema accepts a conformant manifest", async () => {
  const schema = await loadSchema("source.schema.json");
  assert.deepEqual(validateValue(validSource(), schema, "example-source"), []);
});

test("the real source schema rejects every drift the hand validator used to miss", async () => {
  const schema = await loadSchema("source.schema.json");
  const bad = {
    ...validSource(),
    schemaVersion: 2, // const 1
    slug: "Bad Slug", // pattern
    kind: "podcast", // enum
    priority: "urgent", // enum
    status: "live", // enum
    desiredOutputs: ["rule", "nonsense"], // enum item
    bogusField: true, // additionalProperties: false
  };
  const errors = validateValue(bad, schema, bad.slug);
  const joined = errors.join("\n");
  assert.match(joined, /must equal 1/);
  assert.match(joined, /must match pattern/);
  assert.match(joined, /\.kind must be one of/);
  assert.match(joined, /\.priority must be one of/);
  assert.match(joined, /\.status must be one of/);
  assert.match(joined, /desiredOutputs\[1\] must be one of/);
  assert.match(joined, /bogusField is not an allowed property/);
});

test("additionalProperties:false rejects extra keys named after Object.prototype members", async () => {
  const schema = await loadSchema("source.schema.json");
  // `toString`/`constructor`/`hasOwnProperty` live on the prototype chain; a
  // prototype-walking membership test would wrongly treat them as allowed.
  for (const proto of ["toString", "constructor", "hasOwnProperty", "valueOf"]) {
    const errors = validateValue({ ...validSource(), [proto]: "x" }, schema, "s");
    assert.ok(
      errors.includes(`s.${proto} is not an allowed property`),
      `expected ${proto} to be rejected, got ${JSON.stringify(errors)}`,
    );
  }
  // And the nested additionalProperties:false object (rights) is guarded too.
  const base = validSource();
  const nested = { ...base, rights: { ...(base.rights as Record<string, unknown>), toString: "x" } };
  assert.ok(validateValue(nested, schema, "s").includes("s.rights.toString is not an allowed property"));
});

test("minItems and numeric (number/integer) types are enforced", () => {
  assert.deepEqual(validateValue([], { type: "array", minItems: 1 }, "list"), [
    "list must contain at least 1 item(s)",
  ]);
  assert.deepEqual(validateValue(["a"], { type: "array", minItems: 1 }, "list"), []);

  // NaN/Infinity are not finite numbers; floats are not integers.
  assert.deepEqual(validateValue(Number.NaN, { type: "number" }, "n"), [
    "n must be of type number (got number)",
  ]);
  assert.deepEqual(validateValue(1.5, { type: "integer" }, "n"), ["n must be of type integer (got number)"]);
  assert.deepEqual(validateValue(2, { type: "integer" }, "n"), []);
  assert.deepEqual(validateValue(1.5, { type: "number" }, "n"), []);
});

test("collectUnsupportedKeywords passes the committed schemas and catches drift beyond the subset", async () => {
  // Guards #200's premise: validation must never silently enforce less than a
  // schema declares. If a schema gains an un-interpreted keyword, this fails.
  for (const name of SCHEMA_FILES) {
    const schema = await loadSchema(name);
    assert.deepEqual(collectUnsupportedKeywords(schema), [], `${name} uses an unsupported keyword`);
  }
  const drifted: JsonSchema = {
    type: "object",
    properties: {
      tags: { type: "array", uniqueItems: true },
      count: { type: "integer", minimum: 0 },
    },
  };
  const unsupported = collectUnsupportedKeywords(drifted);
  assert.ok(unsupported.includes("properties.tags.uniqueItems"));
  assert.ok(unsupported.includes("properties.count.minimum"));
});

test("the real transcript schema enforces the derivatives sub-shape", async () => {
  const schema = await loadSchema("transcript-resource.schema.json");
  const bad = {
    schemaVersion: 1,
    slug: "t1",
    sourceSlug: "s1",
    sourceKind: "youtube-video",
    title: "T",
    url: "https://x",
    capturedAt: "2026-01-01T00:00:00.000Z",
    transcriptPath: "transcripts/s1/t1.transcript.md",
    transcriptFormat: "markdown",
    rights: { status: "user-provided", notes: "n" },
    tags: [],
    derivatives: { skillCandidates: [] }, // missing appCandidates + toolCandidates
  };
  const errors = validateValue(bad, schema, "t1");
  assert.ok(errors.includes("t1.derivatives.appCandidates is required"));
  assert.ok(errors.includes("t1.derivatives.toolCandidates is required"));
});
