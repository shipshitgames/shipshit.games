import assert from "node:assert/strict";
import { test } from "node:test";

import { collectIds } from "./promote";

test("collectIds reads a single --id", () => {
  assert.deepEqual(collectIds(["--id", "alpha", "--game", "shared"]), ["alpha"]);
});

test("collectIds reads repeated --id flags", () => {
  assert.deepEqual(collectIds(["--id", "alpha", "--id", "beta"]), ["alpha", "beta"]);
});

test("collectIds splits comma lists and trims blanks", () => {
  assert.deepEqual(collectIds(["--id", "alpha, beta ,, gamma"]), ["alpha", "beta", "gamma"]);
});

test("collectIds merges repeated and comma forms", () => {
  assert.deepEqual(collectIds(["--id", "a,b", "--id", "c"]), ["a", "b", "c"]);
});

test("collectIds returns empty when no --id is present", () => {
  assert.deepEqual(collectIds(["--all", "--game", "shared"]), []);
  // A trailing --id with no value is ignored rather than capturing the next flag.
  assert.deepEqual(collectIds(["--id"]), []);
});
