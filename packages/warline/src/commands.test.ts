import { test } from "node:test";
import assert from "node:assert/strict";

import { createInitialWorld, regionById } from "./map";
import { canAfford, applyCommand } from "./commands";
import type { Command, WorldState } from "./types";
import { COMMAND_COSTS, COMMAND_EFFECT } from "./types";

const NOW = 1_700_000_000_000;

test("fortify raises defense, lowers pressure, and costs scrap+fuel", () => {
  const w = createInitialWorld(NOW);
  const defBefore = regionById(w, "ashgate")!.defense;
  const scrapBefore = w.resources.scrap;
  const fuelBefore = w.resources.fuel;
  const cmd: Command = { kind: "fortify", regionId: "ashgate", faction: "wardens" };
  const res = applyCommand(w, cmd, NOW);
  assert.equal(res.ok, true);
  const region = regionById(res.state, "ashgate")!;
  assert.equal(region.defense, defBefore + COMMAND_EFFECT.fortifyDefense);
  assert.equal(res.state.resources.scrap, scrapBefore - (COMMAND_COSTS.fortify.scrap ?? 0));
  assert.equal(res.state.resources.fuel, fuelBefore - (COMMAND_COSTS.fortify.fuel ?? 0));
  assert.equal(res.state.feed[0]!.kind, "command");
});

test("fortify rejects a non-human region (state unchanged)", () => {
  const w = createInitialWorld(NOW);
  const snapshot = JSON.stringify(w);
  const cmd: Command = { kind: "fortify", regionId: "maw", faction: "wardens" };
  const res = applyCommand(w, cmd, NOW);
  assert.equal(res.ok, false);
  assert.ok(res.error);
  assert.equal(JSON.stringify(res.state), snapshot, "state untouched");
});

test("muster raises pactArmy and spends biomass+scrap", () => {
  const w = createInitialWorld(NOW);
  const res = applyCommand(w, { kind: "muster", faction: "pyre" }, NOW);
  assert.equal(res.ok, true);
  assert.equal(res.state.pactArmy, COMMAND_EFFECT.musterArmy);
  assert.equal(res.state.resources.biomass, 200 - (COMMAND_COSTS.muster.biomass ?? 0));
});

test("deploy on a weak scourge region recaptures it", () => {
  const w = createInitialWorld(NOW);
  // make maw weak enough that -35 pressure lands at/under the flip threshold (50)
  w.regions.find((r) => r.id === "maw")!.pressure = 80; // 80 - 35 = 45 <= 50
  w.pactArmy = 100; // afford the army cost
  const cmd: Command = { kind: "deploy", regionId: "maw", faction: "wardens" };
  const res = applyCommand(w, cmd, NOW);
  assert.equal(res.ok, true);
  const region = regionById(res.state, "maw")!;
  assert.equal(region.faction, "wardens", "recaptured");
  assert.equal(region.defense, COMMAND_EFFECT.deployCaptureDefense);
  assert.equal(region.revealed, true);
  assert.equal(res.state.pactArmy, 100 - (COMMAND_COSTS.deploy.army ?? 0));
});

test("deploy flips a neutral region to the faction", () => {
  const w = createInitialWorld(NOW);
  w.pactArmy = 100;
  const res = applyCommand(
    w,
    { kind: "deploy", regionId: "rustmarch", faction: "pyre" },
    NOW,
  );
  assert.equal(res.ok, true);
  assert.equal(regionById(res.state, "rustmarch")!.faction, "pyre");
});

test("recon reveals a hidden region", () => {
  const w = createInitialWorld(NOW);
  assert.equal(regionById(w, "maw")!.revealed, false);
  const res = applyCommand(w, { kind: "recon", regionId: "maw", faction: "wardens" }, NOW);
  assert.equal(res.ok, true);
  assert.equal(regionById(res.state, "maw")!.revealed, true);
});

test("canAfford is false when broke; applyCommand returns ok:false unchanged", () => {
  const w: WorldState = createInitialWorld(NOW);
  w.resources = { scrap: 0, biomass: 0, fuel: 0, intel: 0 };
  w.pactArmy = 0;
  assert.equal(canAfford(w, "fortify"), false);
  assert.equal(canAfford(w, "deploy"), false);
  const snapshot = JSON.stringify(w);
  const res = applyCommand(w, { kind: "fortify", regionId: "ashgate", faction: "wardens" }, NOW);
  assert.equal(res.ok, false);
  assert.equal(JSON.stringify(res.state), snapshot);
});

test("deploy unaffordable when no army even if fuel present", () => {
  const w = createInitialWorld(NOW);
  w.pactArmy = 0; // deploy needs army 40
  assert.equal(canAfford(w, "deploy"), false);
});
