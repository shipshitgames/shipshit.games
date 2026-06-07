import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface AssetEntry {
  id: string;
  kind: string;
  game: string;
  path: string; // relative to the assets root
  prompt?: string;
  provider?: string;
  model?: string;
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
  license?: {
    type: string;
    provider?: string;
    model?: string;
    generatedAt?: string;
    terms?: string;
    url?: string;
  };
  preview?: string;
}

/** Upsert an asset entry into a game's assets.json (single source of truth). */
export async function register(manifestPath: string, entry: AssetEntry): Promise<void> {
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
