import { expect, test } from "bun:test";

const spec = await Bun.file(new URL("./ENGINE-EXTRACTION-BOUNDARY.md", import.meta.url)).text();

test("engine extraction boundary classifies the issue 8 module inventory", () => {
  const requiredPhrases = [
    "`Game` orchestrator",
    "GameContext",
    "GameSystems",
    "RenderSystem",
    "ArenaSystem",
    "InputSystem",
    "HudSystem",
    "FxSystem",
    "ProjectilesSystem",
    "PickupsSystem",
    "PartyKit transport",
    "WeaponSystem",
    "WEAPONS",
    "Enemy stats",
    "PveDirectorSystem",
    "SurvivorsSystem",
    "data/maps.ts",
    "constants.ts",
    "HUD.tsx",
    "Audio",
  ];

  for (const phrase of requiredPhrases) {
    expect(spec).toContain(phrase);
  }
});

test("engine extraction boundary records package surface and extension points", () => {
  const requiredSections = [
    "## Proposed Package Surface",
    "## Required Extension Points",
    "GameDefinition",
    "GameSystem",
    "CameraRigPreset",
    "GameContent",
    "MapProvider",
    "SpawnPointProvider",
    "ActionMap",
    "HudSnapshot",
    "NetworkCodec",
  ];

  for (const section of requiredSections) {
    expect(spec).toContain(section);
  }
});
