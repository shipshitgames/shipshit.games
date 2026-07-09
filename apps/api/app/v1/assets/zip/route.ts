import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { assetExtension } from "@/lib/asset-storage";
import { AssetArchiveTooLargeError, type AssetWithImage, readAssetFiles } from "@/lib/assets";
import { makeZip } from "@/lib/zip";

export const runtime = "nodejs";

const MAX_ZIP_ASSETS = 64;
const MAX_ZIP_BYTES = 32 * 1024 * 1024;

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "asset"
  );
}

function zipName(asset: AssetWithImage, index: number): string {
  const frame = asset.record.pose
    ? slug(asset.record.pose)
    : `frame-${(asset.record.sliceIndex ?? index) + 1}`;
  return `${String(index + 1).padStart(2, "0")}-${slug(asset.record.subject)}-${frame}.${assetExtension(asset.record.mediaType)}`;
}

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { ids } = await req.json().catch(() => ({}) as Record<string, unknown>);
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "ids must be an array of asset ids" }, { status: 400 });
  }
  if (ids.length < 1 || ids.length > MAX_ZIP_ASSETS) {
    return NextResponse.json(
      { error: `zip requires 1-${MAX_ZIP_ASSETS} assets` },
      { status: 400 },
    );
  }

  let files: AssetWithImage[];
  try {
    files = await readAssetFiles(ids, auth.userId, MAX_ZIP_BYTES);
  } catch (error) {
    if (error instanceof AssetArchiveTooLargeError) {
      return NextResponse.json({ error: "asset archive exceeds 32 MiB" }, { status: 413 });
    }
    throw error;
  }
  if (files.length !== new Set(ids).size) {
    return NextResponse.json({ error: "one or more assets were not found" }, { status: 404 });
  }

  const zip = makeZip(
    files.map((asset, index) => ({ name: zipName(asset, index), data: asset.image })),
  );
  return new Response(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="asset-frames.zip"',
      "cache-control": "no-store",
    },
  });
}
