import { db } from "./db";
import { randomUUID } from "node:crypto";
import { readAssetObject, storeAssetImage } from "./asset-storage";

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
  storageKey: string | null;
  imageUrl: string | null;
  mediaType: string;
  byteSize: number | null;
  ownerId: string | null;
  createdAt: string;
}

export type AssetFile =
  | { kind: "redirect"; url: string; mediaType: string }
  | { kind: "bytes"; data: Buffer; mediaType: string };

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
  storageKey: true,
  imageUrl: true,
  mediaType: true,
  byteSize: true,
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

export function assetUrl(record: Pick<AssetRecord, "id" | "imageUrl">): string {
  return record.imageUrl ?? `/v1/assets/${record.id}/file`;
}

export async function saveAsset(asset: NewAsset, image: Buffer): Promise<AssetRecord> {
  const id = randomUUID();
  const stored = await storeAssetImage(id, image);
  const row = await db.asset.create({
    // Copy: Prisma 6 wants a plain Uint8Array and Buffers can view shared memory.
    data: {
      id,
      ...asset,
      image: stored ? null : new Uint8Array(image),
      storageKey: stored?.storageKey ?? null,
      imageUrl: stored?.imageUrl ?? null,
      mediaType: stored?.mediaType ?? "image/png",
      byteSize: stored?.byteSize ?? image.byteLength,
    },
    select: RECORD_SELECT,
  });
  return toRecord(row);
}

async function fetchImageUrl(url: string): Promise<Buffer | null> {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)) return null;
  const res = await fetch(parsed);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

export async function readAssetImage(id: string): Promise<Buffer | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const row = await db.asset.findUnique({
    where: { id },
    select: { image: true, storageKey: true, imageUrl: true },
  });
  if (!row) return null;
  if (row.storageKey) {
    const stored = await readAssetObject(row.storageKey);
    if (stored) return stored;
  }
  if (row.image) return Buffer.from(row.image);
  if (row.imageUrl) return fetchImageUrl(row.imageUrl);
  return null;
}

export async function readAssetFile(id: string): Promise<AssetFile | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const row = await db.asset.findUnique({
    where: { id },
    select: { image: true, storageKey: true, imageUrl: true, mediaType: true },
  });
  if (!row) return null;

  if (row.imageUrl) {
    return { kind: "redirect", url: row.imageUrl, mediaType: row.mediaType };
  }
  if (row.storageKey) {
    const stored = await readAssetObject(row.storageKey);
    if (stored) return { kind: "bytes", data: stored, mediaType: row.mediaType };
  }
  if (row.image) return { kind: "bytes", data: Buffer.from(row.image), mediaType: row.mediaType };
  return null;
}
