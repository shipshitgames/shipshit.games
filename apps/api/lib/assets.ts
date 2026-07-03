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
  parentId: string | null;
  sliceIndex: number | null;
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
  parentId: true,
  sliceIndex: true,
  createdAt: true,
} as const;

const IMAGE_SELECT = {
  ...RECORD_SELECT,
  image: true,
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
  gameSlug: string | null;
  game: string | null;
  model: string;
  ownerId: string | null;
  parentId?: string | null;
  sliceIndex?: number | null;
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

async function resolveImageBytes(row: {
  image: Uint8Array | null;
  storageKey: string | null;
  imageUrl: string | null;
}): Promise<Buffer | null> {
  if (row.storageKey) {
    const stored = await readAssetObject(row.storageKey);
    if (stored) return stored;
  }
  if (row.image) return Buffer.from(row.image);
  if (row.imageUrl) return fetchImageUrl(row.imageUrl);
  return null;
}

export async function readAssetImage(id: string): Promise<Buffer | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const row = await db.asset.findUnique({
    where: { id },
    select: { image: true, storageKey: true, imageUrl: true },
  });
  if (!row) return null;
  return resolveImageBytes(row);
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

export interface AssetWithImage {
  record: AssetRecord;
  image: Buffer;
}

export async function readAssetWithImage(id: string): Promise<AssetWithImage | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const row = await db.asset.findUnique({ where: { id }, select: IMAGE_SELECT });
  if (!row) return null;
  const image = await resolveImageBytes(row);
  if (!image) return null;
  return { record: toRecord(row), image };
}

export async function listAssetSlices(parentId: string): Promise<AssetRecord[]> {
  if (!/^[a-f0-9-]{36}$/.test(parentId)) return [];
  const rows = await db.asset.findMany({
    where: { parentId },
    select: RECORD_SELECT,
    orderBy: [{ sliceIndex: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toRecord);
}

export async function readAssetFiles(ids: string[]): Promise<AssetWithImage[]> {
  const uniqueIds = [...new Set(ids)].filter((id) => /^[a-f0-9-]{36}$/.test(id));
  if (!uniqueIds.length) return [];

  const rows = await db.asset.findMany({
    where: { id: { in: uniqueIds } },
    select: IMAGE_SELECT,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const files: AssetWithImage[] = [];
  for (const id of uniqueIds) {
    const row = byId.get(id);
    if (!row) continue;
    const image = await resolveImageBytes(row);
    if (image) files.push({ record: toRecord(row), image });
  }
  return files;
}

export function imageContentType(image: Buffer): string {
  if (
    image.length >= 12 &&
    image.subarray(0, 4).toString("ascii") === "RIFF" &&
    image.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (image.length >= 8 && image.subarray(0, 8).equals(pngSignature)) {
    return "image/png";
  }
  if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) {
    return "image/jpeg";
  }
  return "application/octet-stream";
}
