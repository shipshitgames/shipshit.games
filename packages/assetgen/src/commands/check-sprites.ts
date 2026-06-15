import { existsSync } from "node:fs";

import {
  formatReports,
  gateSpriteGeometry,
  loadSpriteContract,
  mergeContract,
  type SpriteContract,
} from "../sprite-geometry.ts";
import { flag, has } from "./args.ts";
import { defaultAssetsDir } from "./paths.ts";

/**
 * Sprite frame-set geometry gate (issue #166): verify every `<id>.anim.json`
 * sprite-anim sheet satisfies the structural contract (canonical direction set +
 * coverage, frame-count integrity, in-bounds rects, no blank frames) plus any
 * declared per-game contract (direction count, required states, uniform frames,
 * max dims, aspect band). Exits non-zero with a per-asset diff when any sheet
 * fails — run it before `assetgen atlas`, in CI, or a pre-commit hook.
 */
export async function runCheckSpritesCommand(argv: string[]): Promise<void> {
  const assetsDir = flag(argv, "assets-dir") || defaultAssetsDir();
  if (!existsSync(assetsDir)) {
    console.error(`[check-sprites] assets dir not found: ${assetsDir} — pass --assets-dir <@shipshitgames/assets path>`);
    process.exit(1);
  }
  const game = flag(argv, "game");
  const readPixels = !has(argv, "no-pixels");

  const fileContract = await loadSpriteContract(assetsDir, game);
  const contract = mergeContract(fileContract, contractFromFlags(argv));

  const { ok, reports } = await gateSpriteGeometry({ assetsDir, game, contract, readPixels });

  if (has(argv, "json")) {
    console.log(JSON.stringify({ ok, assetsDir, game: game ?? null, reports }, null, 2));
  }

  if (reports.length === 0) {
    if (!has(argv, "json")) console.log(`[check-sprites] no sprite-anim sheets found under ${assetsDir}${game ? ` for game "${game}"` : ""}`);
    return;
  }

  if (!has(argv, "json")) console.log(formatReports(reports));

  if (!ok) {
    // In --json mode the report is already on stdout; keep stderr clean so the
    // output stays purely machine-readable. The exit code is the failure signal.
    if (!has(argv, "json")) {
      const failed = reports.filter((r) => !r.ok).length;
      console.error(`[check-sprites] ${failed}/${reports.length} sheet(s) violate the frame-set geometry contract`);
    }
    process.exit(1);
  }
  if (!has(argv, "json")) console.log(`[check-sprites] all ${reports.length} sheet(s) satisfy the frame-set geometry contract`);
}

/** Build a contract from CLI flags; only set fields the user actually passed (these override the file contract). */
function contractFromFlags(argv: string[]): SpriteContract {
  const contract: SpriteContract = {};

  const dirsRaw = flag(argv, "dirs");
  if (dirsRaw !== undefined) {
    const n = parseInt(dirsRaw, 10);
    if (Number.isFinite(n) && n > 0) contract.directions = n;
  }

  const statesRaw = flag(argv, "states");
  if (statesRaw !== undefined) {
    const states = statesRaw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (states.length) contract.states = states;
  }

  if (has(argv, "uniform-frames")) contract.uniformFrames = true;

  const maxRaw = flag(argv, "max-frame-dims");
  if (maxRaw !== undefined) {
    const dims = parsePair(maxRaw, "x");
    if (dims) contract.maxFrameDims = dims;
  }

  const aspectRaw = flag(argv, "aspect");
  if (aspectRaw !== undefined) {
    const range = parsePair(aspectRaw, ",");
    if (range) contract.aspectRange = range;
  }

  return contract;
}

/** Parse "AxB" / "A,B" into a finite positive number pair, or undefined. */
function parsePair(raw: string, sep: string): [number, number] | undefined {
  const parts = raw.split(sep).map((p) => Number(p.trim()));
  if (parts.length !== 2) return undefined;
  const [a, b] = parts;
  if (a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return undefined;
  return [a, b];
}
