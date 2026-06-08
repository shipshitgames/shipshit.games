import assert from "node:assert/strict";
import { test } from "node:test";

import gameCatalog from "../../shared/src/games.json";
import { GAME_FRAMING, GAME_VIEW } from "./style";

test("style framing covers every canonical game slug", () => {
  assert.equal(gameCatalog.gameSlugs.length, 6);

  for (const slug of gameCatalog.gameSlugs) {
    assert.equal(typeof GAME_FRAMING[slug], "string", `${slug} is missing generation framing`);
    assert.notEqual(GAME_FRAMING[slug]?.trim(), "", `${slug} has empty generation framing`);
    assert.equal(typeof GAME_VIEW[slug], "string", `${slug} is missing CLI view label`);
    assert.notEqual(GAME_VIEW[slug]?.trim(), "", `${slug} has empty CLI view label`);
  }
});
