import { NextResponse } from "next/server";
import { apiFetch, withLocalAssetUrls } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  const res = await apiFetch("/v1/assets");
  const json = await res.json().catch(() => ({ error: "invalid API response" }));
  if (Array.isArray(json.assets)) json.assets = withLocalAssetUrls(json.assets);
  return NextResponse.json(json, { status: res.status });
}
