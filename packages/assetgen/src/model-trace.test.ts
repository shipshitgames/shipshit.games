import assert from "node:assert/strict";
import { test } from "node:test";

import { isGitLfsFilter } from "./model-trace";

test("isGitLfsFilter accepts only an explicit lfs filter attribute", () => {
  assert.equal(isGitLfsFilter("sources/models/host.glb: filter: lfs\n"), true);
  assert.equal(isGitLfsFilter("sources/models/host.glb: filter: unspecified\n"), false);
  assert.equal(isGitLfsFilter("fatal: not a git repository\n"), false);
});
