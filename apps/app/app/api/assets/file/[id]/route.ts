import { readAssetImage } from "@/lib/asset-lab-store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = await readAssetImage(id);
  if (!image) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(image), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
