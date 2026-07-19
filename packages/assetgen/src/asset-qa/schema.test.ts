/**
 * Contract test binding asset-qa.schema.json to parseAssetQaManifest.
 *
 * The published schema is an editor aid; parseAssetQaManifest is the runtime
 * authority. Where JSON Schema 2020-12 can express a rule, the two must agree
 * so a manifest never passes one and fails the other. A handful of rules
 * (cross-field numeric ordering, per-property uniqueness) cannot be expressed
 * in standard 2020-12; for those the parser is deliberately stricter and this
 * test pins that documented, one-directional gap so it cannot silently widen.
 */
import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";

import schema from "../../asset-qa.schema.json";
import { parseAssetQaManifest } from "./manifest.ts";

// strict:true also meta-validates the schema against the 2020-12 dialect on
// compile, so an illegal schema (e.g. draft-07 tuple `items`) fails here.
const validate = new Ajv2020({ strict: true }).compile(schema as object);

function schemaAccepts(manifest: unknown): boolean {
  return validate(manifest) === true;
}

function parserAccepts(manifest: unknown): boolean {
  try {
    parseAssetQaManifest(manifest);
    return true;
  } catch {
    return false;
  }
}

function manifest(target: Record<string, unknown>): Record<string, unknown> {
  return { schemaVersion: 1, targets: [target] };
}

const baseChecks = { webpEncoding: "lossless" as const };
const baseOutput = { format: "webp", lossless: true };

describe("asset QA schema and parser stay aligned", () => {
  test("the schema compiles and meta-validates under draft 2020-12", () => {
    assert.equal((schema as { $schema: string }).$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.doesNotThrow(() => new Ajv2020({ strict: true }).compile(schema as object));
  });

  test("both accept the checked-in complete manifest shape", () => {
    const value = manifest({
      id: "sprite",
      path: "runtime/sprite.webp",
      checks: baseChecks,
      repair: { output: baseOutput },
    });
    assert.equal(schemaAccepts(value), true);
    assert.equal(parserAccepts(value), true);
  });

  test("schema and parser agree that paths reject '..' segments (finding 1b)", () => {
    for (const path of ["assets/../sprite.webp", "a/..", "../sprite.webp", "../../etc/passwd"]) {
      const value = manifest({ id: "sprite", path, checks: baseChecks });
      assert.equal(schemaAccepts(value), false, `schema should reject path ${path}`);
      assert.equal(parserAccepts(value), false, `parser should reject path ${path}`);
    }
    // A single '.' segment is not a traversal; both accept it.
    const dot = manifest({ id: "sprite", path: "./sprite.webp", checks: baseChecks });
    assert.equal(schemaAccepts(dot), true);
    assert.equal(parserAccepts(dot), true);
    // repair.source is held to the same rule.
    const badSource = manifest({
      id: "sprite",
      path: "sprite.webp",
      checks: baseChecks,
      repair: { source: "atlas/../secret.webp", output: baseOutput },
    });
    assert.equal(schemaAccepts(badSource), false);
    assert.equal(parserAccepts(badSource), false);
  });

  test("schema and parser agree on crop alpha/bounds exclusivity (finding 1d)", () => {
    const bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    const crops: Array<[Record<string, unknown>, boolean]> = [
      [{ bounds }, true],
      [{ alpha: true }, true],
      [{ bounds, alpha: true }, false],
      [{ bounds, alpha: false }, false],
      [{ bounds, alpha: "yes" }, false],
      [{ alpha: false }, false],
      [{}, false],
    ];
    for (const [crop, expected] of crops) {
      const value = manifest({
        id: "sprite",
        path: "sprite.webp",
        checks: baseChecks,
        repair: { crop, output: baseOutput },
      });
      assert.equal(schemaAccepts(value), expected, `schema on crop ${JSON.stringify(crop)}`);
      assert.equal(parserAccepts(value), expected, `parser on crop ${JSON.stringify(crop)}`);
    }
  });

  test("the parser enforces rules JSON Schema 2020-12 cannot express (findings 1a, 1c)", () => {
    // 1a: alphaMin <= alphaMax is a cross-field comparison the schema cannot
    // make, so the schema admits it and the parser is the sole guard.
    const misordered = manifest({
      id: "sprite",
      path: "sprite.webp",
      checks: { alpha: { darkFringe: { alphaMin: 200, alphaMax: 100 } } },
    });
    assert.equal(schemaAccepts(misordered), true);
    assert.equal(parserAccepts(misordered), false);
    const ordered = manifest({
      id: "sprite",
      path: "sprite.webp",
      checks: { alpha: { darkFringe: { alphaMin: 100, alphaMax: 200 } } },
    });
    assert.equal(schemaAccepts(ordered), true);
    assert.equal(parserAccepts(ordered), true);

    // 1c: per-property id uniqueness cannot be expressed either; the schema's
    // uniqueItems only catches wholly identical entries, so the parser guards
    // the same-id/different-path case.
    const duplicateDifferentPath = {
      schemaVersion: 1,
      targets: [
        { id: "sprite", path: "a.webp", checks: baseChecks },
        { id: "sprite", path: "b.webp", checks: baseChecks },
      ],
    };
    assert.equal(schemaAccepts(duplicateDifferentPath), true);
    assert.equal(parserAccepts(duplicateDifferentPath), false);

    // uniqueItems does reject byte-identical duplicate targets, so both fail.
    const identical = {
      schemaVersion: 1,
      targets: [
        { id: "sprite", path: "a.webp", checks: baseChecks },
        { id: "sprite", path: "a.webp", checks: baseChecks },
      ],
    };
    assert.equal(schemaAccepts(identical), false);
    assert.equal(parserAccepts(identical), false);
  });
});
