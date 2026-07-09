import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { readAssetFile } from "@/lib/assets";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const file = await readAssetFile(id, auth.userId);
  if (!file) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "content-type": file.mediaType,
      "cache-control": "private, no-store",
    },
  });
}
