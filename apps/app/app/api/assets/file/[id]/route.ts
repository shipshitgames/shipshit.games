import { apiFetch } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response("not found", { status: 404 });
  const res = await apiFetch(`/v1/assets/${id}/file`);
  if (!res.ok) return new Response("not found", { status: res.status });
  return new Response(res.body, {
    headers: {
      "content-type": res.headers.get("content-type") ?? "image/png",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
