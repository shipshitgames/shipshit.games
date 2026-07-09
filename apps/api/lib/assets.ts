import { db } from "./db";
import { randomUUID } from "node:crypto";
import { deleteAssetObject, readAssetObject, storeAssetImage } from "./asset-storage";

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
  mediaType: string;
  byteSize: number | null;
  ownerId: string | null;
  parentId: string | null;
  sliceIndex: number | null;
  createdAt: string;
}

export type AssetFile =
  { kind: "bytes"; data: Buffer; mediaType: string };

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
  imageUrl: true,
} as const;

function toRecord(
  row: { createdAt: Date; sheetPoses: string[]; image?: Uint8Array | null; imageUrl?: string | null } &
    Omit<AssetRecord, "createdAt" | "sheetPoses">,
): AssetRecord {
  const { image: _image, imageUrl: _imageUrl, ...record } = row;
  return {
    ...record,
    // Postgres stores [], the API contract is null for single sprites.
    sheetPoses: row.sheetPoses.length ? row.sheetPoses : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function requireOwnerId(ownerId: string): string {
  if (!ownerId) throw new Error("ownerId is required for asset access");
  return ownerId;
}

export async function listAssets(ownerId: string): Promise<AssetRecord[]> {
  const rows = await db.asset.findMany({
    where: { ownerId: requireOwnerId(ownerId) },
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
  ownerId: string;
  parentId?: string | null;
  sliceIndex?: number | null;
}

interface AssetPersistenceDeps {
  storeImage?: typeof storeAssetImage;
  deleteObject?: typeof deleteAssetObject;
}

export function assetUrl(record: Pick<AssetRecord, "id">): string {
  return `/v1/assets/${record.id}/file`;
}

export async function saveAsset(
  asset: NewAsset,
  image: Buffer,
  deps: AssetPersistenceDeps = {},
): Promise<AssetRecord> {
  const id = randomUUID();
  requireOwnerId(asset.ownerId);
  const mediaType = imageContentType(image);
  const stored = await (deps.storeImage ?? storeAssetImage)(id, image, mediaType);
  try {
    const row = await db.asset.create({
      // Copy: Prisma 6 wants a plain Uint8Array and Buffers can view shared memory.
      data: {
        id,
        ...asset,
        image: stored ? null : new Uint8Array(image),
        storageKey: stored?.storageKey ?? null,
        imageUrl: stored?.imageUrl ?? null,
        mediaType: stored?.mediaType ?? mediaType,
        byteSize: stored?.byteSize ?? image.byteLength,
      },
      select: RECORD_SELECT,
    });
    return toRecord(row);
  } catch (error) {
    if (stored) {
      try {
        await (deps.deleteObject ?? deleteAssetObject)(stored.storageKey);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `asset metadata write failed and object cleanup failed for ${stored.storageKey}`,
        );
      }
    }
    throw error;
  }
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

export async function readAssetImage(id: string, ownerId: string): Promise<Buffer | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const row = await db.asset.findFirst({
    where: { id, ownerId: requireOwnerId(ownerId) },
    select: { image: true, storageKey: true, imageUrl: true },
  });
  if (!row) return null;
  return resolveImageBytes(row);
}

export async function readAssetFile(id: string, ownerId: string): Promise<AssetFile | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const row = await db.asset.findFirst({
    where: { id, ownerId: requireOwnerId(ownerId) },
    select: { image: true, storageKey: true, imageUrl: true, mediaType: true },
  });
  if (!row) return null;

  if (row.storageKey) {
    const stored = await readAssetObject(row.storageKey);
    if (stored) return { kind: "bytes", data: stored, mediaType: row.mediaType };
  }
  if (row.image) return { kind: "bytes", data: Buffer.from(row.image), mediaType: row.mediaType };
  if (row.imageUrl) {
    const legacy = await fetchImageUrl(row.imageUrl);
    if (legacy) return { kind: "bytes", data: legacy, mediaType: row.mediaType };
  }
  return null;
}

export interface AssetWithImage {
  record: AssetRecord;
  image: Buffer;
}

export class AssetArchiveTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`asset archive exceeds ${maxBytes} bytes`);
    this.name = "AssetArchiveTooLargeError";
  }
}

export async function readAssetWithImage(id: string, ownerId: string): Promise<AssetWithImage | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const row = await db.asset.findFirst({
    where: { id, ownerId: requireOwnerId(ownerId) },
    select: IMAGE_SELECT,
  });
  if (!row) return null;
  const image = await resolveImageBytes(row);
  if (!image) return null;
  return { record: toRecord(row), image };
}

export async function listAssetSlices(parentId: string, ownerId: string): Promise<AssetRecord[]> {
  if (!/^[a-f0-9-]{36}$/.test(parentId)) return [];
  const rows = await db.asset.findMany({
    where: { parentId, ownerId: requireOwnerId(ownerId) },
    select: RECORD_SELECT,
    orderBy: [{ sliceIndex: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toRecord);
}

export async function readAssetFiles(
  ids: string[],
  ownerId: string,
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<AssetWithImage[]> {
  const uniqueIds = [...new Set(ids)].filter((id) => /^[a-f0-9-]{36}$/.test(id));
  if (!uniqueIds.length) return [];

  const rows = await db.asset.findMany({
    where: { id: { in: uniqueIds }, ownerId: requireOwnerId(ownerId) },
    select: IMAGE_SELECT,
  });
  const knownBytes = rows.reduce((total, row) => total + (row.byteSize ?? 0), 0);
  if (knownBytes > maxBytes) throw new AssetArchiveTooLargeError(maxBytes);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const files: AssetWithImage[] = [];
  let loadedBytes = 0;
  for (const id of uniqueIds) {
    const row = byId.get(id);
    if (!row) continue;
    const image = await resolveImageBytes(row);
    if (image) {
      loadedBytes += image.byteLength;
      if (loadedBytes > maxBytes) throw new AssetArchiveTooLargeError(maxBytes);
      files.push({ record: toRecord(row), image });
    }
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
