import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { db } from "@/lib/db";
import { recordWebhookEvent } from "@/lib/webhook-events";

export const runtime = "nodejs";

interface ClerkUserPayload {
  id: string;
  email_addresses?: { id: string; email_address: string }[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
}

interface ClerkEvent {
  type: string;
  data: ClerkUserPayload;
}

function primaryEmail(user: ClerkUserPayload): string | null {
  const list = user.email_addresses ?? [];
  return (
    list.find((e) => e.id === user.primary_email_address_id)?.email_address ??
    list[0]?.email_address ??
    null
  );
}

// Keeps the User mirror in sync with Clerk (user.created/updated/deleted).
export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new Response("clerk webhook is not configured", { status: 503 });

  const body = await req.text();
  let event: ClerkEvent;
  try {
    event = new Webhook(secret).verify(body, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    }) as ClerkEvent;
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  const deliveryId = req.headers.get("svix-id");
  const fresh = await recordWebhookEvent("clerk", deliveryId, event.type, event);
  if (!fresh) return NextResponse.json({ received: true, duplicate: true });

  const user = event.data;
  switch (event.type) {
    case "user.created":
    case "user.updated":
      await db.user.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          email: primaryEmail(user),
          firstName: user.first_name ?? null,
          lastName: user.last_name ?? null,
          imageUrl: user.image_url ?? null,
        },
        update: {
          email: primaryEmail(user),
          firstName: user.first_name ?? null,
          lastName: user.last_name ?? null,
          imageUrl: user.image_url ?? null,
          deletedAt: null,
        },
      });
      break;
    case "user.deleted":
      await db.user.updateMany({
        where: { id: user.id },
        data: { deletedAt: new Date() },
      });
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
