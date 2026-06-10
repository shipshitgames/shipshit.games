import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface AssetRecord {
  id: string;
  /** User-typed subject, without the template wrapping. */
  subject: string;
  /** Free-form character bible used for consistency, if provided. */
  description: string | null;
  fullPrompt: string;
  style: string | null;
  pose: string | null;
  /** Poses laid out in a 1xN sheet, when the asset is a sheet. */
  sheetPoses: string[] | null;
  gameSlug: string | null;
  game: string | null;
  model: string;
  createdAt: string;
}

// Vercel's function filesystem is read-only outside /tmp, so the gallery is
// ephemeral per-instance there until we move it to durable storage (e.g. Blob).
const DIR = process.env.VERCEL ? "/tmp/asset-lab" : join(process.cwd(), ".asset-lab");
const MANIFEST = join(DIR, "manifest.json");

async function readManifest(): Promise<AssetRecord[]> {
  try {
    return JSON.parse(await readFile(MANIFEST, "utf8"));
  } catch {
    return [];
  }
}

export async function listAssets(): Promise<AssetRecord[]> {
  const records = await readManifest();
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveAsset(record: AssetRecord, image: Buffer): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(join(DIR, `${record.id}.png`), image);
  const records = await readManifest();
  records.push(record);
  await writeFile(MANIFEST, JSON.stringify(records, null, 2));
}

export async function readAssetImage(id: string): Promise<Buffer | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  try {
    return await readFile(join(DIR, `${id}.png`));
  } catch {
    return null;
  }
}
