import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildPlan,
  loadBlueprints,
  selectBlueprint,
  serializeBuildPlan,
  type Blueprint,
} from "./build-plan.ts";
import type { BrokenAssetGap, VariantGap } from "./gap-map.ts";
import type { DesignMetadata } from "./doc-ingestion.ts";

const repoSkillsDir = fileURLToPath(
  new URL("../../../.agents/skills", import.meta.url),
);

const BP: Blueprint = {
  gameType: "horde-shooter",
  genreAliases: ["horde shooter", "survivors"],
  assetClasses: [
    { category: "sprite", items: ["player", "enemies"], mvp: true },
    { category: "music", items: ["loop"], mvp: true },
    { category: "ui", items: ["hud"], mvp: true },
    { category: "model", items: ["props"], mvp: false },
  ],
  mvpSlice: ["player", "3 enemies"],
};

const design: DesignMetadata = {
  title: "Scourge",
  genre: "horde shooter",
  coreLoop: "survive escalating waves",
  mvpRequirements: ["player", "enemies"],
  winCondition: null,
  problem: null,
  goal: null,
};

function vg(entity: string): VariantGap {
  return {
    entity,
    name: entity,
    kind: "enemy" as VariantGap["kind"],
    faction: "scourge" as VariantGap["faction"],
    game: "scourge-survivors" as VariantGap["game"],
    assetType: "sprite",
    priority: 1,
  };
}

function bk(detail: string): BrokenAssetGap {
  return {
    game: "scourge-survivors",
    check: "orphan" as BrokenAssetGap["check"],
    assetType: "ui",
    priority: 3,
    detail,
  };
}

test("selectBlueprint matches by gameType and aliases, slug-insensitively", () => {
  const list = [BP];
  assert.equal(
    selectBlueprint(list, "horde shooter")?.gameType,
    "horde-shooter",
  );
  assert.equal(
    selectBlueprint(list, "First-Person Horde Shooter")?.gameType,
    "horde-shooter",
  );
  assert.equal(selectBlueprint(list, "survivors")?.gameType, "horde-shooter");
  assert.equal(selectBlueprint(list, "moba"), null);
  assert.equal(selectBlueprint(list, null), null);
  assert.equal(selectBlueprint(list, ""), null);
});

test("checked-in side-scroller blueprint matches Rothulk's genres", async () => {
  const blueprints = await loadBlueprints(repoSkillsDir);
  const blueprint = selectBlueprint(blueprints, "Platform Infiltration");

  assert.equal(blueprint?.gameType, "side-scroller");
  assert.equal(blueprint?.skill, "build-side-scroller-game");
  assert.deepEqual(
    blueprint?.assetClasses
      .filter((assetClass) => assetClass.mvp)
      .map((assetClass) => assetClass.category),
    ["sprite", "ui", "vfx", "music"],
  );
  assert.ok(blueprint?.mvpSlice.includes("stomp-kill combat"));
  assert.ok(blueprint?.mvpSlice.includes("2 authored levels"));
  assert.equal(
    selectBlueprint(blueprints, "Infiltration platformer")?.gameType,
    "side-scroller",
  );
});

test("checked-in platformer runner blueprint matches Redline's genre", async () => {
  const blueprints = await loadBlueprints(repoSkillsDir);
  const blueprint = selectBlueprint(blueprints, "Courier Runner");

  assert.equal(blueprint?.gameType, "platformer-runner");
  assert.equal(blueprint?.skill, "build-platformer-runner-game");
  assert.deepEqual(
    blueprint?.assetClasses
      .filter((assetClass) => assetClass.mvp)
      .map((assetClass) => assetClass.category),
    ["sprite", "ui", "vfx", "music"],
  );
  assert.ok(blueprint?.mvpSlice.includes("seeded course generation"));
  assert.ok(blueprint?.mvpSlice.includes("beacon finish"));
});

test("checked-in space shooter blueprint matches Starblight's genre", async () => {
  const blueprints = await loadBlueprints(repoSkillsDir);
  const blueprint = selectBlueprint(blueprints, "Top-Down Ship Survivor");

  assert.equal(blueprint?.gameType, "space-shooter");
  assert.equal(blueprint?.skill, "build-space-shooter-game");
  assert.deepEqual(
    blueprint?.assetClasses
      .filter((assetClass) => assetClass.mvp)
      .map((assetClass) => assetClass.category),
    ["sprite", "ui", "vfx", "music"],
  );
  assert.ok(blueprint?.mvpSlice.includes("5 auto-fire weapons"));
  assert.ok(blueprint?.mvpSlice.includes("3-phase boss"));
  assert.equal(
    selectBlueprint(blueprints, "Arcade Space Shooter")?.gameType,
    "space-shooter",
  );
});

test("checked-in strategy campaign blueprint matches Warline's genres", async () => {
  const blueprints = await loadBlueprints(repoSkillsDir);
  const blueprint = selectBlueprint(blueprints, "Strategy Hub");

  assert.equal(blueprint?.gameType, "strategy-campaign");
  assert.equal(blueprint?.skill, "build-strategy-campaign-game");
  assert.deepEqual(
    blueprint?.assetClasses
      .filter((assetClass) => assetClass.mvp)
      .map((assetClass) => assetClass.category),
    ["model", "ui", "vfx", "music"],
  );
  assert.ok(
    blueprint?.mvpSlice.includes("Fortify, Muster, Deploy, and Recon commands"),
  );
  assert.ok(blueprint?.mvpSlice.includes("LIVE PartyKit-ready transport seam"));
  assert.equal(
    selectBlueprint(blueprints, "Persistent Strategy Campaign")?.gameType,
    "strategy-campaign",
  );
});

test("checked-in fighting blueprint matches Brawl's genres", async () => {
  const blueprints = await loadBlueprints(repoSkillsDir);
  const blueprint = selectBlueprint(blueprints, "Platform Fighter");

  assert.equal(blueprint?.gameType, "fighting");
  assert.equal(blueprint?.skill, "build-fighting-game");
  assert.deepEqual(
    blueprint?.assetClasses
      .filter((assetClass) => assetClass.mvp)
      .map((assetClass) => assetClass.category),
    ["sprite", "ui", "vfx", "music"],
  );
  assert.ok(blueprint?.mvpSlice.includes("4 fighter pose-sheet sets"));
  assert.ok(blueprint?.mvpSlice.includes("Duel mode: 1v1 KO"));
  assert.ok(
    blueprint?.mvpSlice.includes(
      "Arena mode: damage-percent knockback and stocks",
    ),
  );
  for (const genre of [
    "Fighting",
    "Fighting Game",
    "Brawler",
    "Competitive Brawler",
    "Platform Fighter",
    "Arena Fighter",
    "Versus Fighter",
    "Combat Arena",
  ]) {
    assert.equal(
      selectBlueprint(blueprints, genre)?.gameType,
      "fighting",
      `expected ${genre} to select the fighting blueprint`,
    );
  }
});

test("buildPlan orders MVP-first by priority, tags coverage + summary", () => {
  const plan = buildPlan({
    project: "deadrot",
    game: "scourge-survivors",
    genre: "horde shooter",
    design,
    missing: [vg("scourge-swarm"), vg("scourge-brute")],
    broken: [bk("stray.webp")],
    blueprint: BP,
  });
  assert.equal(plan.blueprint, "horde-shooter");
  assert.equal(plan.summary.totalTasks, 3);
  assert.equal(plan.summary.missing, 2);
  assert.equal(plan.summary.broken, 1);
  assert.equal(plan.summary.blueprintMatched, true);

  // sprites (priority 1, MVP) outrank the UI broken item (priority 3)
  const first = plan.worklist[0]!;
  assert.equal(first.assetType, "sprite");
  assert.equal(first.order, 1);
  assert.equal(first.mvp, true);
  assert.equal(plan.worklist[plan.worklist.length - 1]!.status, "broken");

  // deterministic order numbers, 1..n
  assert.deepEqual(
    plan.worklist.map((w) => w.order),
    [1, 2, 3],
  );

  // a coverage row per blueprint class; sprite class shows 2 gaps
  assert.equal(plan.blueprintCoverage.length, BP.assetClasses.length);
  assert.equal(
    plan.blueprintCoverage.find((c) => c.category === "sprite")?.gaps,
    2,
  );
  assert.equal(
    plan.blueprintCoverage.find((c) => c.category === "model")?.gaps,
    0,
  );
});

test("buildPlan without a blueprint still works (no MVP tagging, empty coverage)", () => {
  const plan = buildPlan({
    project: "deadrot",
    game: "scourge-survivors",
    genre: null,
    design,
    missing: [vg("x")],
    broken: [],
    blueprint: null,
  });
  assert.equal(plan.blueprint, null);
  assert.equal(plan.summary.blueprintMatched, false);
  assert.equal(plan.summary.mvpTasks, 0);
  assert.equal(plan.worklist[0]!.mvp, false);
  assert.equal(plan.blueprintCoverage.length, 0);
});

test("serializeBuildPlan is stable, newline-terminated JSON", () => {
  const plan = buildPlan({
    project: "p",
    game: "scourge-survivors",
    genre: null,
    design,
    missing: [],
    broken: [],
    blueprint: null,
  });
  const s = serializeBuildPlan(plan);
  assert.ok(s.endsWith("\n"));
  assert.deepEqual(JSON.parse(s).worklist, []);
  assert.equal(JSON.parse(s).summary.totalTasks, 0);
});
