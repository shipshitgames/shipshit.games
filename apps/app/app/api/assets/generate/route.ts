import { NextResponse } from "next/server";
import { apiFetch, withLocalAssetUrls } from "@/lib/api";

export const runtime = "nodejs";
// Generation can poll Replicate for minutes; keep headroom for the upstream call.
export const maxDuration = 300;

export async function POST(req: Request) {
  const idempotencyKey = req.headers.get("idempotency-key");
  const res = await apiFetch("/v1/assets/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: await req.text(),
  });
  const json = await res.json().catch(() => ({ error: "invalid API response" }));
  if (Array.isArray(json.assets)) json.assets = withLocalAssetUrls(json.assets);
  const retryAfter = res.headers.get("retry-after");
  return NextResponse.json(json, {
    status: res.status,
    headers: retryAfter ? { "retry-after": retryAfter } : undefined,
  });
}
