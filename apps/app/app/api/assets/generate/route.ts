import { execFileSync } from "node:child_process";
import { NextResponse } from "next/server";
import { GAMES } from "@shipshitgames/shared";
import { aspectRatioFor, SHEET_POSES, spritePrompt } from "@/lib/asset-prompt";
import { readAssetImage, saveAsset } from "@/lib/asset-lab-store";
import type { AssetRecord } from "@/lib/asset-lab-store";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "google/nano-banana-2";
const MAX_BATCH = 4;

function getReplicateToken(): string | undefined {
  if (process.env.REPLICATE_API_TOKEN) return process.env.REPLICATE_API_TOKEN;
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-a", "shipshit", "-s", "shipshit-replicate", "-w"],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return undefined;
  }
}

function outputUrl(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.find((o) => typeof o === "string");
  return undefined;
}

/** Upload a stored PNG to Replicate's Files API so it can be used as image_input. */
async function uploadReference(token: string, image: Buffer): Promise<string> {
  const form = new FormData();
  form.append("content", new Blob([new Uint8Array(image)], { type: "image/png" }), "reference.png");
  const res = await fetch("https://api.replicate.com/v1/files", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Replicate file upload ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  const url = json.urls?.get;
  if (!url) throw new Error("Replicate file upload returned no URL");
  return url;
}

async function runPrediction(
  token: string,
  prompt: string,
  aspectRatio: string,
  referenceUrl?: string,
): Promise<string> {
  const input: Record<string, unknown> = { prompt, aspect_ratio: aspectRatio };
  if (referenceUrl) input.image_input = [referenceUrl];
  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      prefer: "wait=60",
    },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) throw new Error(`Replicate ${res.status}: ${await res.text()}`);

  let prediction: any = await res.json();
  const started = Date.now();
  const done = new Set(["succeeded", "failed", "canceled"]);
  while (prediction?.status && !done.has(prediction.status)) {
    if (Date.now() - started > 280_000) throw new Error("Replicate timed out");
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(prediction.urls?.get ?? prediction.urls?.self, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!poll.ok) throw new Error(`Replicate poll ${poll.status}`);
    prediction = await poll.json();
  }
  if (prediction?.status !== "succeeded") {
    throw new Error(`Prediction ${prediction?.status ?? "failed"}: ${prediction?.error ?? "unknown"}`);
  }
  const url = outputUrl(prediction.output);
  if (!url) throw new Error("No output image URL");
  return url;
}

export async function POST(req: Request) {
  const { prompt, description, gameSlug, pose, count, sourceId, sheet } = await req
    .json()
    .catch(() => ({}));
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  const game = GAMES.find((g) => g.slug === gameSlug);
  if (!game) {
    return NextResponse.json({ error: `unknown game: ${gameSlug}` }, { status: 400 });
  }
  const batch = Math.min(Math.max(Number(count) || 1, 1), MAX_BATCH);

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
    const source = await readAssetImage(sourceId);
    if (!source) {
      return NextResponse.json({ error: `source asset not found: ${sourceId}` }, { status: 404 });
    }
    try {
      referenceUrl = await uploadReference(token, source);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "upload failed" }, { status: 502 });
    }
  }

  const sheetPoses = sheet ? [...SHEET_POSES] : undefined;
  const fullPrompt = spritePrompt({
    subject: prompt,
    description,
    gameSlug: game.slug,
    pose,
    sheetPoses,
    fromReference: Boolean(referenceUrl),
  });
  const aspectRatio = aspectRatioFor(sheetPoses);

  const results = await Promise.allSettled(
    Array.from({ length: batch }, () => runPrediction(token, fullPrompt, aspectRatio, referenceUrl)),
  );

  const assets: (AssetRecord & { url: string })[] = [];
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
    const record: AssetRecord = {
      id: crypto.randomUUID(),
      subject: prompt,
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      fullPrompt,
      style: "art bible",
      pose: sheetPoses ? null : (pose ?? null),
      sheetPoses: sheetPoses ?? null,
      gameSlug: game.slug,
      game: game.title,
      model: MODEL,
      createdAt: new Date().toISOString(),
    };
    await saveAsset(record, Buffer.from(await imageRes.arrayBuffer()));
    assets.push({ ...record, url: `/api/assets/file/${record.id}` });
  }

  if (assets.length === 0) {
    return NextResponse.json({ error: errors[0] ?? "generation failed" }, { status: 502 });
  }
  return NextResponse.json({ assets, errors });
}
