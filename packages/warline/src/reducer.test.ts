import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createInitialWorld,
  regionById,
  breachById,
  laneById,
} from "./map";
import { applyOperation, tick, resetWorld, magnitude } from "./reducer";
import type { OperationResult, WorldState } from "./types";
import { SCHEMA_VERSION, TICK } from "./types";

const NOW = 1_700_000_000_000;

function op(partial: Partial<OperationResult> & { game: OperationResult["game"] }): OperationResult {
  return {
    faction: "wardens",
    outcome: "victory",
    score: 2000,
    ...partial,
  };
}

test("createInitialWorld has the expected shape", () => {
  const w = createInitialWorld(NOW);
  assert.equal(w.schema, SCHEMA_VERSION);
  assert.equal(w.epoch, 1);
  assert.equal(w.tick, 0);
  assert.equal(w.startedAt, NOW);
  assert.equal(w.updatedAt, NOW);
  assert.equal(w.pactArmy, 0);
  assert.deepEqual(w.resources, { scrap: 500, biomass: 200, fuel: 300, intel: 150 });
  assert.equal(w.regions.length, 10);
  assert.equal(w.lanes.length, 14);
  assert.equal(w.breaches.length, 3);
  assert.equal(w.feed.length, 0);
});

test("reducers do not mutate the input world", () => {
  const w = createInitialWorld(NOW);
  const snapshot = JSON.stringify(w);
  applyOperation(w, op({ game: "scourge-survivors" }), NOW);
  tick(w, NOW);
  assert.equal(JSON.stringify(w), snapshot);
});

test("magnitude: victory in band, defeat low", () => {
  const v = magnitude(op({ game: "redline", outcome: "victory", score: 2000 }));
  assert.ok(v >= 0.6 && v <= 1.4, `victory magnitude ${v}`);
  const d = magnitude(op({ game: "redline", outcome: "defeat", score: 2000 }));
  assert.ok(d < 0.6, `defeat magnitude ${d}`);
});

test("purge-breach lowers breach intensity and credits biomass", () => {
  const w = createInitialWorld(NOW);
  // hottest active breach is breach-perdition (intensity 92)
  const before = breachById(w, "breach-perdition")!.intensity;
  const { state, credited } = applyOperation(w, op({ game: "scourge-survivors" }), NOW);
  const after = breachById(state, "breach-perdition")!.intensity;
  assert.ok(after < before, "intensity should drop");
  assert.ok((credited.biomass ?? 0) > 0, "biomass credited");
  assert.equal(state.feed.length, 1);
  assert.equal(state.feed[0]!.kind, "purge-breach");
});

test("purge can seal a breach (active=false, intel bonus, event.sealed)", () => {
  let w = createInitialWorld(NOW);
  // force the choir breach low so a single purge seals it
  const b = w.breaches.find((x) => x.id === "breach-perdition")!;
  b.intensity = 5;
  // and lower the others so choir stays the targeted (hottest) one is fine either way,
  // but explicitly target it via targetId for determinism.
  const intelBefore = w.resources.intel;
  const { state } = applyOperation(
    w,
    op({ game: "scourge-survivors", targetId: "breach-perdition", score: 4000 }),
    NOW,
  );
  const sealed = breachById(state, "breach-perdition")!;
  assert.equal(sealed.active, false);
  assert.equal(sealed.intensity, 0);
  assert.ok(state.resources.intel >= intelBefore + 120, "intel seal bonus");
  assert.equal(state.feed[0]!.sealed, true);
  assert.equal(state.feed[0]!.kind, "purge-breach");
});

test("hold-lane reduces flow and fortifies a human endpoint", () => {
  const w = createInitialWorld(NOW);
  // target an explicit lane bordering a human region: l-rust-maw borders rustmarch (neutral)
  // use l-spire-rustmarch? that's neutral control bordering spire(human). flow 52.
  const laneId = "l-spire-rustmarch";
  const flowBefore = laneById(w, laneId)!.flow;
  const defBefore = regionById(w, "spire")!.defense;
  const { state } = applyOperation(
    w,
    op({ game: "deadlane", targetId: laneId }),
    NOW,
  );
  assert.ok(laneById(state, laneId)!.flow < flowBefore, "flow drops");
  assert.ok(regionById(state, "spire")!.defense > defBefore, "human endpoint fortified");
});

test("contest-territory flips a neutral region to the faction", () => {
  const w = createInitialWorld(NOW);
  const { state } = applyOperation(
    w,
    op({ game: "pactfall", faction: "pyre", targetId: "rustmarch" }),
    NOW,
  );
  assert.equal(regionById(state, "rustmarch")!.faction, "pyre");
});

test("run-logistics musters army and credits scrap+fuel", () => {
  const w = createInitialWorld(NOW);
  const { state, credited } = applyOperation(w, op({ game: "redline" }), NOW);
  assert.ok(state.pactArmy > 0, "army raised");
  assert.ok((credited.scrap ?? 0) > 0 && (credited.fuel ?? 0) > 0);
});

test("defeat still trickles intel and is mild", () => {
  const w = createInitialWorld(NOW);
  const before = breachById(w, "breach-perdition")!.intensity;
  const { state, credited } = applyOperation(
    w,
    op({ game: "scourge-survivors", outcome: "defeat", targetId: "breach-perdition" }),
    NOW,
  );
  assert.equal((credited.intel ?? 0), 8, "defeat recon trickle");
  assert.equal(breachById(state, "breach-perdition")!.intensity, before, "no purge on defeat");
});

test("tick raises pressure near a breach and never exceeds 100", () => {
  const w = createInitialWorld(NOW);
  const before = regionById(w, "maw")!.pressure; // 92, has breach-primus
  const next = tick(w, NOW + TICK.defenseDecay);
  const after = regionById(next, "maw")!.pressure;
  assert.ok(after >= before, "pressure rose or held near breach");
  for (const r of next.regions) {
    assert.ok(r.pressure <= 100 && r.pressure >= 0, `pressure in range for ${r.id}`);
    assert.ok(r.defense <= 100 && r.defense >= 0);
  }
  for (const b of next.breaches) {
    assert.ok(b.intensity <= 100 && b.intensity >= 0);
  }
  for (const l of next.lanes) {
    assert.ok(l.flow <= 100 && l.flow >= 0);
  }
  assert.equal(next.tick, 1);
});

test("a maxed-pressure human region falls to the scourge", () => {
  const w = createInitialWorld(NOW);
  const spire = w.regions.find((r) => r.id === "spire")!;
  spire.pressure = 100;
  const next = tick(w, NOW);
  const after = regionById(next, "spire")!;
  assert.equal(after.faction, "scourge");
  assert.equal(after.defense, 0);
  const fall = next.feed.find((e) => e.kind === "fall");
  assert.ok(fall, "fall event pushed");
});

test("tick economy credits resources for human and scourge counts", () => {
  const w = createInitialWorld(NOW);
  const scrapBefore = w.resources.scrap;
  const biomassBefore = w.resources.biomass;
  const next = tick(w, NOW);
  // 4 human regions, 3 scourge regions initially
  assert.ok(next.resources.scrap > scrapBefore, "scrap grew");
  assert.ok(next.resources.biomass > biomassBefore, "biomass grew");
});

test("resetWorld increments epoch and seeds a reset event", () => {
  const fresh: WorldState = resetWorld(NOW, 3);
  assert.equal(fresh.epoch, 4);
  assert.equal(fresh.feed.length, 1);
  assert.equal(fresh.feed[0]!.kind, "reset");
  const def = resetWorld(NOW);
  assert.equal(def.epoch, 1);
});
