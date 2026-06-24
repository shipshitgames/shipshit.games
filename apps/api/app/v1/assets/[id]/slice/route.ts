import { NextResponse } from "next/server";
import { toSpriteSheetWebp } from "@shipshitgames/assetgen/sprites";

import { requireAuth } from "@/lib/auth";
import { listAssetSlices, readAssetWithImage, saveAsset } from "@/lib/assets";

export const runtime = "nodejs";
export const maxDuration = 120;

function frameSubject(subject: string, pose: string, index: number): string {
  return `${subject} - ${pose || `frame ${index + 1}`}`;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const source = await readAssetWithImage(id);
  if (!source) {
    return NextResponse.json({ error: `asset not found: ${id}` }, { status: 404 });
  }

  const poses = source.record.sheetPoses;
  if (!poses?.length) {
    return NextResponse.json({ error: "asset is not a pose sheet" }, { status: 400 });
  }

  const existing = await listAssetSlices(id);
  if (
    existing.length === poses.length &&
    poses.every((_, index) => existing.some((asset) => asset.sliceIndex === index))
  ) {
    return NextResponse.json({
      assets: existing.map((asset) => ({ ...asset, url: `/v1/assets/${asset.id}/file` })),
    });
  }

  const existingByIndex = new Map(existing.map((asset) => [asset.sliceIndex, asset]));
  const result = await toSpriteSheetWebp(source.image, {
    id,
    game: source.record.gameSlug ?? "asset-lab",
    prompt: source.record.fullPrompt,
    provider: "asset-lab",
    model: source.record.model,
    views: ["front"],
    frameCount: poses.length,
    size: 1024,
  });

  if (result.frames.length !== poses.length) {
    return NextResponse.json(
      { error: `expected ${poses.length} frames, received ${result.frames.length}` },
      { status: 500 },
    );
  }

  const saved = [...existing];
  for (const [index, frame] of result.frames.entries()) {
    if (existingByIndex.has(index)) continue;
    const pose = poses[index] ?? `frame ${index + 1}`;
    const record = await saveAsset(
      {
        subject: frameSubject(source.record.subject, pose, index),
        description: source.record.description,
        fullPrompt: source.record.fullPrompt,
        style: source.record.style,
        pose,
        sheetPoses: [],
        gameSlug: source.record.gameSlug,
        game: source.record.game,
        model: source.record.model,
        ownerId: auth.userId,
        parentId: id,
        sliceIndex: index,
      },
      frame.data,
    );
    saved.push(record);
  }

  saved.sort((a, b) => (a.sliceIndex ?? 0) - (b.sliceIndex ?? 0));
  return NextResponse.json({
    assets: saved.map((asset) => ({ ...asset, url: `/v1/assets/${asset.id}/file` })),
  });
}
