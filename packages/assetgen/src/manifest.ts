import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface AssetEntry {
  id: string;
  kind: string;
  game: string;
  path: string; // relative to the assets root
  prompt?: string;
  provider?: string;
  /** Provider model/plan used, surfaced for sprite + image assets. */
  model?: string;
  /** Sprite-sheet geometry (issue #19); present for sprite/sprite-anim assets. */
  dimensions?: [number, number];
  frameSize?: [number, number];
  frames?: number;
  fps?: number;
  anchor?: [number, number];
  scale?: number;
  views?: string[];
  sheet?: {
    columns: number;
    rows: number;
    usedColumns: number;
    usedRows: number;
  };
  /** Relative path to a generated billboard preview, if any. */
  preview?: string;
  /** Required provenance/license record (issue #17): no generator may skip this. */
  license: AssetLicenseRecord;
}

export interface AssetLicenseRecord {
  /** Generation or conversion tool, e.g. "codex", "openai", "ffmpeg". */
  tool: string;
  /** Tool plan/model/preset used for reviewable provenance. */
  plan: string;
  /** ISO calendar date when the final asset was produced. */
  date: string;
  /** Asset kind covered by this license/provenance record. */
  kind: string;
  /** Optional AI-generation disclosure (issue #19 sprites / #59 legal). */
  type?: string;
  terms?: string;
  url?: string;
  generatedAt?: string;
}

/** Upsert an asset entry into a game's assets.json (single source of truth). */
export async function register(manifestPath: string, entry: AssetEntry): Promise<void> {
  assertLicenseRecord(entry);
  let data: { assets: AssetEntry[] } = { assets: [] };
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
    if (Array.isArray(parsed.assets)) data = parsed;
  } catch {
    /* new manifest */
  }
  const i = data.assets.findIndex((a) => a.id === entry.id && a.kind === entry.kind);
  if (i >= 0) data.assets[i] = entry;
  else data.assets.push(entry);
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(data, null, 2) + "\n");
}

function assertLicenseRecord(entry: AssetEntry): void {
  const required = ["tool", "plan", "date", "kind"] as const;
  for (const field of required) {
    const value = entry.license?.[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`asset manifest entry ${entry.id}:${entry.kind} requires license.${field}`);
    }
  }
}
