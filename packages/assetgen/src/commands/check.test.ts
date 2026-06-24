import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { isAssetIndexFile } from "./check.ts";

describe("assetgen check command", () => {
  test("recognizes only the full index and known per-game index files", () => {
    assert.equal(isAssetIndexFile("assets.index.json"), true);
    assert.equal(isAssetIndexFile("assets.index.scourge-survivors.json"), true);
    assert.equal(isAssetIndexFile("assets.index.pactfall.json"), true);

    assert.equal(isAssetIndexFile("assets.index.schema.json"), false);
    assert.equal(isAssetIndexFile("assets.index.unknown-game.json"), false);
    assert.equal(isAssetIndexFile("assets-catalog.json"), false);
  });
});
