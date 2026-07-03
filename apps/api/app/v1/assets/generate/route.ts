import { NextResponse } from "next/server";
import { GAMES } from "@shipshitgames/shared";
import { requireAuth } from "@/lib/auth";
import { assetUrl, readAssetImage, saveAsset } from "@/lib/assets";
import { aspectRatioFor, SHEET_POSES, spritePrompt } from "@/lib/asset-prompt";
import { db } from "@/lib/db";
import { getReplicateToken, MODEL, runPrediction, uploadReference } from "@/lib/replicate";

export const runtime = "nodejs";
// Generation polls Replicate for minutes per image.
export const maxDuration = 300;

const MAX_BATCH = 4;
// Each render is paid Replicate spend; cap per user per hour (DB-counted, so
// it holds across serverless instances).
const HOURLY_LIMIT = Number(process.env.GENERATE_HOURLY_LIMIT) || 30;

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { prompt, description, gameSlug, pose, count, sourceId, sheet } = await req
    .json()
    .catch(() => ({}) as Record<string, unknown>);
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  const game = GAMES.find((g) => g.slug === gameSlug);
  if (!game) {
    return NextResponse.json({ error: `unknown game: ${gameSlug}` }, { status: 400 });
  }
  const batch = Math.min(Math.max(Number(count) || 1, 1), MAX_BATCH);

  const recentCount = await db.asset.count({
    where: {
      ownerId: auth.userId,
      parentId: null,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (recentCount + batch > HOURLY_LIMIT) {
    return NextResponse.json(
      { error: `generation limit reached (${HOURLY_LIMIT}/hour)` },
      { status: 429 },
    );
  }

  const token = getReplicateToken();
  if (!token) {
    return NextResponse.json(
      {
        error:
          "No Replicate key found. Set REPLICATE_API_TOKEN or run: security add-generic-password -a shipshit -s shipshit-replicate -w <KEY>",
      },
      { status: 503 },
    );
  }

  // Reprints are conditioned on the original render so the character stays identical.
  let referenceUrl: string | undefined;
  if (sourceId) {
    const source = await readAssetImage(String(sourceId));
    if (!source) {
      return NextResponse.json({ error: `source asset not found: ${sourceId}` }, { status: 404 });
    }
    try {
      referenceUrl = await uploadReference(token, source);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "upload failed" },
        { status: 502 },
      );
    }
  }

  const sheetPoses = sheet ? [...SHEET_POSES] : undefined;
  const fullPrompt = spritePrompt({
    subject: prompt,
    description: typeof description === "string" ? description : undefined,
    gameSlug: game.slug,
    pose: typeof pose === "string" ? pose : undefined,
    sheetPoses,
    fromReference: Boolean(referenceUrl),
  });
  const aspectRatio = aspectRatioFor(sheetPoses);

  const results = await Promise.allSettled(
    Array.from({ length: batch }, () => runPrediction(token, fullPrompt, aspectRatio, referenceUrl)),
  );

  const saved = [];
  const errors: string[] = [];
  for (const result of results) {
    if (result.status === "rejected") {
      errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      continue;
    }
    const imageRes = await fetch(result.value);
    if (!imageRes.ok) {
      errors.push(`Image download failed (${imageRes.status})`);
      continue;
    }
    try {
      const record = await saveAsset(
        {
          subject: prompt,
          description:
            typeof description === "string" && description.trim() ? description.trim() : null,
          fullPrompt,
          style: "art bible",
          pose: sheetPoses ? null : typeof pose === "string" ? pose : null,
          sheetPoses: sheetPoses ?? [],
          gameSlug: game.slug,
          game: game.title,
          model: MODEL,
          ownerId: auth.userId,
        },
        Buffer.from(await imageRes.arrayBuffer()),
      );
      saved.push({ ...record, url: assetUrl(record) });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "asset save failed");
    }
  }

  if (saved.length === 0) {
    return NextResponse.json({ error: errors[0] ?? "generation failed" }, { status: 502 });
  }
  return NextResponse.json({ assets: saved, errors });
}
