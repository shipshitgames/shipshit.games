import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { flag, has } from "./args.ts";
import { defaultAssetsDir } from "./paths.ts";

type Vec3 = [number, number, number];

type WeaponEntry = {
  weapon?: {
    muzzle?: Vec3;
    flashScale?: number;
  };
};

type ScourgeAssetsManifest = {
  sprites?: Record<string, WeaponEntry>;
};

const DEFAULT_GAME = "scourge-survivors";
const WEAPON_IDS = ["pistol", "smg", "shotgun", "cannon", "sniper"] as const;

export async function runMuzzleTunerCommand(argv: string[]): Promise<void> {
  const game = flag(argv, "game", DEFAULT_GAME)!;
  const assetsDir = flag(argv, "assets-dir") || defaultAssetsDir();
  const manifestPath = flag(argv, "manifest") || join(assetsDir, "games", game, "assets.json");
  const weapon = flag(argv, "weapon");
  const muzzle = parseVec3(flag(argv, "muzzle"));
  const flashScale = parseOptionalNumber(flag(argv, "flash-scale"));
  const write = has(argv, "write");

  if (has(argv, "help")) {
    printUsage();
    return;
  }

  if (has(argv, "script")) {
    console.log(liveTunerScript());
    return;
  }

  if (!existsSync(manifestPath)) {
    console.error(`[muzzle-tuner] manifest not found: ${manifestPath}`);
    console.error("[muzzle-tuner] pass --manifest <path> or --assets-dir <deadrot packages/assets path>");
    process.exit(1);
  }

  const manifest = await readManifest(manifestPath);
  if (weapon !== undefined && !isWeaponId(weapon)) {
    console.error(`[muzzle-tuner] unsupported --weapon "${weapon}" (${WEAPON_IDS.join(", ")})`);
    process.exit(1);
  }

  if ((muzzle !== undefined || flashScale !== undefined || write) && weapon === undefined) {
    console.error("[muzzle-tuner] --write/--muzzle/--flash-scale require --weapon <id>");
    process.exit(1);
  }

  if (weapon !== undefined && (muzzle !== undefined || flashScale !== undefined)) {
    const entry = weaponEntry(manifest, weapon);
    if (!entry.weapon) entry.weapon = {};
    if (muzzle !== undefined) entry.weapon.muzzle = muzzle;
    if (flashScale !== undefined) entry.weapon.flashScale = flashScale;

    if (write) {
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
      console.log(`[muzzle-tuner] wrote ${manifestPath}`);
    } else {
      console.log("[muzzle-tuner] dry run; add --write to update assets.json");
    }
  }

  const selectedWeapons = weapon ? [weapon] : [...WEAPON_IDS];
  const rows = selectedWeapons.map((id) => formatWeapon(manifest, id));
  if (has(argv, "json")) {
    console.log(JSON.stringify(Object.fromEntries(rows.map((row) => [row.weapon, row])), null, 2));
  } else {
    for (const row of rows) {
      console.log(
        `${row.weapon}: muzzle=[${row.muzzle.join(", ")}] flashScale=${row.flashScale} manifest=${manifestPath}`,
      );
    }
  }
}

export async function readManifest(path: string): Promise<ScourgeAssetsManifest> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as ScourgeAssetsManifest;
  if (!parsed.sprites || typeof parsed.sprites !== "object") {
    throw new Error(`[muzzle-tuner] manifest has no sprites map: ${path}`);
  }
  return parsed;
}

export function parseVec3(raw: string | undefined): Vec3 | undefined {
  if (raw === undefined) return undefined;
  const parts = raw.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`[muzzle-tuner] invalid --muzzle "${raw}" (expected x,y,z)`);
  }
  return [parts[0]!, parts[1]!, parts[2]!];
}

export function liveTunerScript(): string {
  return `(() => {
  const weapons = ${JSON.stringify(WEAPON_IDS)};
  const game = window.__fpsGame;
  if (!game) {
    alert("window.__fpsGame is missing. Run Scourge Survivors in dev mode first.");
    return;
  }
  if (!game.ctx?.sandbox) game.startSandbox?.();
  const panel = document.createElement("form");
  panel.id = "shipshit-muzzle-tuner";
  panel.innerHTML = \`
    <style>
      #shipshit-muzzle-tuner {
        position: fixed; top: 16px; right: 16px; z-index: 2147483647;
        width: 330px; padding: 12px; border: 1px solid #ff6a00;
        background: rgba(8, 7, 6, 0.92); color: #f2ead8;
        font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
        box-shadow: 0 14px 42px rgba(0,0,0,.55); letter-spacing: 0;
      }
      #shipshit-muzzle-tuner label { display: grid; grid-template-columns: 36px 1fr 56px; gap: 8px; align-items: center; margin: 8px 0; }
      #shipshit-muzzle-tuner input, #shipshit-muzzle-tuner select, #shipshit-muzzle-tuner button {
        font: inherit; color: inherit; background: #151211; border: 1px solid rgba(255,255,255,.22);
      }
      #shipshit-muzzle-tuner input[type=range] { width: 100%; accent-color: #ff6a00; }
      #shipshit-muzzle-tuner .row { display: flex; gap: 8px; margin-top: 10px; }
      #shipshit-muzzle-tuner button { padding: 6px 8px; cursor: pointer; }
      #shipshit-muzzle-tuner textarea { width: 100%; min-height: 92px; margin-top: 10px; background: #0b0908; color: #ffd166; border: 1px solid rgba(255,255,255,.2); font: inherit; }
    </style>
    <strong>Ship Shit muzzle tuner</strong>
    <div style="margin-top:8px">Weapon <select name="weapon"></select></div>
    <label>x <input name="x" type="range" min="-0.8" max="0.8" step="0.01"><output></output></label>
    <label>y <input name="y" type="range" min="-0.3" max="0.8" step="0.01"><output></output></label>
    <label>z <input name="z" type="range" min="-0.8" max="0.2" step="0.01"><output></output></label>
    <label>s <input name="scale" type="range" min="0.05" max="0.9" step="0.01"><output></output></label>
    <div class="row"><button name="copy" type="button">Copy JSON</button><button name="close" type="button">Close</button></div>
    <textarea name="json" readonly></textarea>
  \`;
  document.getElementById(panel.id)?.remove();
  document.body.appendChild(panel);
  const weaponSelect = panel.elements.weapon;
  for (const id of weapons) weaponSelect.append(new Option(id, id));
  const currentWeapon = () => game.ctx?.activeWeapon || weaponSelect.value || "pistol";
  const inputs = {
    x: panel.elements.x,
    y: panel.elements.y,
    z: panel.elements.z,
    scale: panel.elements.scale,
  };
  function activeFlash() {
    game.ctx.sandboxMuzzleHold = true;
    game.ctx.muzzleTimer = 0;
    game.ctx.muzzleFlash.visible = true;
    game.ctx.muzzleLight.position.copy(game.ctx.muzzleFlash.position);
    game.ctx.muzzleLight.intensity = 6;
  }
  function loadFromGame() {
    weaponSelect.value = currentWeapon();
    const p = game.ctx.muzzleFlash.position;
    inputs.x.value = p.x.toFixed(2);
    inputs.y.value = p.y.toFixed(2);
    inputs.z.value = p.z.toFixed(2);
    inputs.scale.value = Number(game.ctx.muzzleFlash.scale.x || 0.25).toFixed(2);
    sync();
  }
  function sync() {
    const x = Number(inputs.x.value);
    const y = Number(inputs.y.value);
    const z = Number(inputs.z.value);
    const scale = Number(inputs.scale.value);
    game.ctx.muzzleFlash.position.set(x, y, z);
    game.ctx.muzzleFlash.scale.setScalar(scale);
    activeFlash();
    for (const input of Object.values(inputs)) input.nextElementSibling.value = Number(input.value).toFixed(2);
    panel.elements.json.value = JSON.stringify({
      weapon: weaponSelect.value,
      muzzle: [x, y, z],
      flashScale: scale,
      cli: \`assetgen muzzle-tuner --weapon \${weaponSelect.value} --muzzle \${x},\${y},\${z} --flash-scale \${scale} --write\`
    }, null, 2);
  }
  weaponSelect.addEventListener("change", () => {
    game.setSandboxWeapon?.(weaponSelect.value);
    requestAnimationFrame(loadFromGame);
  });
  for (const input of Object.values(inputs)) input.addEventListener("input", sync);
  panel.elements.copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(panel.elements.json.value);
  });
  panel.elements.close.addEventListener("click", () => panel.remove());
  loadFromGame();
})();`;
}

function parseOptionalNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`[muzzle-tuner] invalid number "${raw}"`);
  }
  return value;
}

function isWeaponId(value: string): value is (typeof WEAPON_IDS)[number] {
  return WEAPON_IDS.includes(value as (typeof WEAPON_IDS)[number]);
}

function weaponEntry(manifest: ScourgeAssetsManifest, id: string): WeaponEntry {
  const entry = manifest.sprites?.[`weapon-${id}`];
  if (!entry) {
    throw new Error(`[muzzle-tuner] missing sprite entry weapon-${id}`);
  }
  return entry;
}

function formatWeapon(manifest: ScourgeAssetsManifest, id: string) {
  const weapon = weaponEntry(manifest, id).weapon;
  return {
    weapon: id,
    muzzle: weapon?.muzzle ?? [0, 0, 0],
    flashScale: weapon?.flashScale ?? 0,
  };
}

function printUsage(): void {
  console.log(`usage:
  assetgen muzzle-tuner [--assets-dir <deadrot/packages/assets>] [--manifest <assets.json>]
  assetgen muzzle-tuner --weapon shotgun --muzzle -0.12,0.26,-0.18 --flash-scale 0.24 --write
  assetgen muzzle-tuner --script

The --script output is a browser-console tuner for a running Scourge Survivors dev page.
Copy the final CLI line from the panel, then run it here to write the manifest.`);
}
