import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const res = await apiFetch("/v1/assets/zip", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await req.text(),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({ error: "invalid API response" }));
    return NextResponse.json(json, { status: res.status });
  }

  return new Response(res.body, {
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/zip",
      "content-disposition":
        res.headers.get("content-disposition") ?? 'attachment; filename="asset-frames.zip"',
      "cache-control": "no-store",
    },
  });
}
