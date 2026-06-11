import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listAssets } from "@/lib/assets";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const assets = await listAssets();
  return NextResponse.json({
    assets: assets.map((a) => ({ ...a, url: `/v1/assets/${a.id}/file` })),
  });
}
