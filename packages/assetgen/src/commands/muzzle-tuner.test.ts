import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { liveTunerScript, parseVec3, runMuzzleTunerCommand } from "./muzzle-tuner.ts";

const temps: string[] = [];

async function tempManifest() {
  const root = await mkdtemp(join(tmpdir(), "assetgen-muzzle-tuner-"));
  temps.push(root);
  const manifestPath = join(root, "assets.json");
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        sprites: {
          "weapon-shotgun": {
            type: "sprite",
            weapon: {
              muzzle: [0, 0.2, -0.1],
              flashScale: 0.28,
            },
          },
        },
      },
      null,
      2,
    ) + "\n",
  );
  return manifestPath;
}

afterEach(async () => {
  while (temps.length) await rm(temps.pop()!, { recursive: true, force: true });
});

test("parseVec3 accepts signed comma-separated coordinates", () => {
  expect(parseVec3("-0.12, 0.26, -0.18")).toEqual([-0.12, 0.26, -0.18]);
});

test("live tuner script targets the running Scourge dev hook", () => {
  const script = liveTunerScript();
  expect(script).toContain("window.__fpsGame");
  expect(script).toContain("game.ctx.muzzleFlash.position.set");
  expect(script).toContain("assetgen muzzle-tuner --weapon");
});

test("muzzle-tuner writes weapon muzzle metadata into a Deadrot manifest", async () => {
  const manifestPath = await tempManifest();
  await runMuzzleTunerCommand([
    "--manifest",
    manifestPath,
    "--weapon",
    "shotgun",
    "--muzzle",
    "-0.12,0.26,-0.18",
    "--flash-scale",
    "0.24",
    "--write",
  ]);
  const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  expect(parsed.sprites["weapon-shotgun"].weapon.muzzle).toEqual([-0.12, 0.26, -0.18]);
  expect(parsed.sprites["weapon-shotgun"].weapon.flashScale).toBe(0.24);
});
