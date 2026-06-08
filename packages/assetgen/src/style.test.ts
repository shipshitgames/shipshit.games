import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ART_BIBLE,
  ASSET_TYPE_DIRECTION,
  GAME_FRAMING,
  NEGATIVE_PROMPTS,
  PROVIDER_SETTINGS,
  REFERENCE_SLOTS,
  STYLE_REF,
  STYLE_SUFFIX,
  buildPrompt,
} from "./style";

test("generated style exposes the DOOM art-bible contract", () => {
  assert.ok(ART_BIBLE.materialGrammar.some((rule) => rule.includes("blackened iron")));
  assert.ok(ART_BIBLE.lightingGrammar.some((rule) => rule.includes("fuller light")));
  assert.ok(ART_BIBLE.silhouetteGrammar.some((rule) => rule.includes("silhouette first")));
  assert.equal(REFERENCE_SLOTS.palette, "lore/Art/grade/doom.gpl");
  assert.equal(STYLE_REF["scourge-survivors"], "lore/Art/style-refs/scourge-survivors.webp");
  assert.equal(PROVIDER_SETTINGS.openai.model, "gpt-image-2");
});

test("generated style keeps visual drift constraints in the prompt suffix", () => {
  assert.match(STYLE_SUFFIX, /visible chunky pixel grid/);
  assert.match(STYLE_SUFFIX, /blackened iron/);
  assert.match(STYLE_SUFFIX, /fuller flatter sprite lighting/);
  assert.match(STYLE_SUFFIX, /toxic #8bdc1f only for Scourge/);
  assert.ok(NEGATIVE_PROMPTS.includes("magenta cyan or any neon glow"));
  assert.ok(NEGATIVE_PROMPTS.includes("smooth 3D render"));
});

test("buildPrompt includes game framing, asset direction, and Scourge canon", () => {
  const prompt = buildPrompt({
    prompt: "a Scourge ranged host with a ruptured shoulder cannon",
    game: "scourge-survivors",
    kind: "sprite",
  });

  assert.match(prompt, /game sprite/);
  assert.match(prompt, /first-person game billboard sprite/);
  assert.match(prompt, /transparent-cutout ready/);
  assert.match(prompt, /parasite army wearing conquered host races/);
  assert.match(prompt, /breach cores/);
});

test("buildPrompt uses kind-specific art direction without forcing Scourge rules", () => {
  const prompt = buildPrompt({
    prompt: "charred bunker floor",
    game: "deadlane",
    kind: "texture",
  });

  assert.match(prompt, /seamless tileable texture/);
  assert.match(prompt, /top-down or high-angle lane-defense sprite/);
  assert.match(prompt, /tileable material sample/);
  assert.doesNotMatch(prompt, /parasite army/);
  assert.equal(GAME_FRAMING.shared, "game asset");
  assert.match(ASSET_TYPE_DIRECTION.ui ?? "", /toxic green only for Scourge/);
});
