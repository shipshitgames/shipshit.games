import { db } from "./db";

/** Asset metadata as served by list/generate responses (no image bytes). */
export interface AssetRecord {
  id: string;
  subject: string;
  description: string | null;
  fullPrompt: string;
  style: string | null;
  pose: string | null;
  /** null for single sprites — the UI treats truthiness as "is a sheet". */
  sheetPoses: string[] | null;
  gameSlug: string | null;
  game: string | null;
  model: string;
  ownerId: string | null;
  createdAt: string;
}

const RECORD_SELECT = {
  id: true,
  subject: true,
  description: true,
  fullPrompt: true,
  style: true,
  pose: true,
  sheetPoses: true,
  gameSlug: true,
  game: true,
  model: true,
  ownerId: true,
  createdAt: true,
} as const;

function toRecord(
  row: { createdAt: Date; sheetPoses: string[] } & Omit<AssetRecord, "createdAt" | "sheetPoses">,
): AssetRecord {
  return {
    ...row,
    // Postgres stores [], the API contract is null for single sprites.
    sheetPoses: row.sheetPoses.length ? row.sheetPoses : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAssets(): Promise<AssetRecord[]> {
  const rows = await db.asset.findMany({
    select: RECORD_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toRecord);
}

export interface NewAsset {
  subject: string;
  description: string | null;
  fullPrompt: string;
  style: string | null;
  pose: string | null;
  sheetPoses: string[];
  gameSlug: string;
  game: string;
  model: string;
  ownerId: string | null;
}

export async function saveAsset(asset: NewAsset, image: Buffer): Promise<AssetRecord> {
  const row = await db.asset.create({
    // Copy: Prisma 6 wants a plain Uint8Array and Buffers can view shared memory.
    data: { ...asset, image: new Uint8Array(image) },
    select: RECORD_SELECT,
  });
  return toRecord(row);
}

export async function readAssetImage(id: string): Promise<Buffer | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const row = await db.asset.findUnique({ where: { id }, select: { image: true } });
  return row ? Buffer.from(row.image) : null;
}
