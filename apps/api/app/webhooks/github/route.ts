import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readBodyCapped } from "@/lib/webhook-body";
import { recordWebhookEvent } from "@/lib/webhook-events";

export const runtime = "nodejs";

interface PushCommit {
  id: string;
  message: string;
  timestamp: string;
  author?: { username?: string; email?: string };
}

interface PushPayload {
  repository?: { full_name?: string };
  commits?: PushCommit[];
}

function verifySignature(secret: string, body: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const received = header.slice("sha256=".length);
  // Strict hex check: Buffer.from(.., "hex") silently truncates bad input,
  // and timingSafeEqual throws on length mismatch.
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(Buffer.from(received, "hex"), expected);
}

// Ingests push events into the Commit table; /v1/stats/commits reads it.
export async function POST(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return new Response("github webhook is not configured", { status: 503 });

  const body = await readBodyCapped(req);
  if (body === null) return new Response("payload too large", { status: 413 });
  if (!verifySignature(secret, body, req.headers.get("x-hub-signature-256"))) {
    return new Response("invalid signature", { status: 400 });
  }

  const eventType = req.headers.get("x-github-event") ?? "unknown";
  const deliveryId = req.headers.get("x-github-delivery");
  const payload = JSON.parse(body) as PushPayload;

  const fresh = await recordWebhookEvent("github", deliveryId, eventType, payload);
  if (!fresh) return NextResponse.json({ received: true, duplicate: true });

  if (eventType === "push" && payload.repository?.full_name && payload.commits?.length) {
    const repo = payload.repository.full_name;
    await db.commit.createMany({
      data: payload.commits.map((c) => ({
        repo,
        sha: c.id,
        authorLogin: c.author?.username ?? null,
        authorEmail: c.author?.email ?? null,
        message: c.message,
        committedAt: new Date(c.timestamp),
      })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ received: true });
}
