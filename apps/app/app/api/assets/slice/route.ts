import { NextResponse } from "next/server";

import { apiFetch, withLocalAssetUrls } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const { id } = await req.json().catch(() => ({}) as Record<string, unknown>);
  if (typeof id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const res = await apiFetch(`/v1/assets/${id}/slice`, { method: "POST" });
  const json = await res.json().catch(() => ({ error: "invalid API response" }));
  if (Array.isArray(json.assets)) json.assets = withLocalAssetUrls(json.assets);
  return NextResponse.json(json, { status: res.status });
}
