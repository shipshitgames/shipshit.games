import { NextResponse } from "next/server";
import { listAssets } from "@/lib/asset-lab-store";

export const runtime = "nodejs";

export async function GET() {
  const records = await listAssets();
  return NextResponse.json({
    assets: records.map((r) => ({ ...r, url: `/api/assets/file/${r.id}` })),
  });
}
