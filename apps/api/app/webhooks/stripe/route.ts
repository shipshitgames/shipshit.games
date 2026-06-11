import { NextResponse } from "next/server";
import Stripe from "stripe";
import { recordWebhookEvent } from "@/lib/webhook-events";

export const runtime = "nodejs";

// Verified event log only for now — billing fulfillment still lives in
// apps/app's Stripe webhook until the dashboard endpoint is re-pointed here.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("stripe webhook is not configured", { status: 503 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing stripe signature", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await Stripe.webhooks.constructEventAsync(body, signature, secret);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "invalid signature", { status: 400 });
  }

  const fresh = await recordWebhookEvent("stripe", event.id, event.type, event);
  return NextResponse.json({ received: true, duplicate: !fresh });
}
