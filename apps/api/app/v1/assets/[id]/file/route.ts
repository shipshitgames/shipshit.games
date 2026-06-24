import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { imageContentType, readAssetImage } from "@/lib/assets";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const image = await readAssetImage(id);
  if (!image) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(image), {
    headers: {
      "content-type": imageContentType(image),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
