import { NextResponse } from "next/server";
import { apiFetch, withLocalAssetUrls } from "@/lib/api";

export const runtime = "nodejs";
// Generation can poll Replicate for minutes; keep headroom for the upstream call.
export const maxDuration = 300;

export async function POST(req: Request) {
  const res = await apiFetch("/v1/assets/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await req.text(),
  });
  const json = await res.json().catch(() => ({ error: "invalid API response" }));
  if (Array.isArray(json.assets)) json.assets = withLocalAssetUrls(json.assets);
  return NextResponse.json(json, { status: res.status });
}
