import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { readAssetFile } from "@/lib/assets";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const file = await readAssetFile(id);
  if (!file) return new Response("not found", { status: 404 });
  if (file.kind === "redirect") {
    return new Response(null, {
      status: 302,
      headers: {
        location: file.url,
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }
  return new Response(new Uint8Array(file.data), {
    headers: {
      "content-type": file.mediaType,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
