import { NextResponse } from "next/server";
import Stripe from "stripe";
import { billingFulfillment } from "@/lib/billing-fulfillment";
import { billingRepository } from "@/lib/billing-repository";
import { readBodyCapped } from "@/lib/webhook-body";
import {
  beginWebhookEvent,
  completeWebhookEvent,
  failWebhookEvent,
} from "@/lib/webhook-events";
import { processStripeBillingEvent } from "@/lib/stripe-billing";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) {
    return new Response("stripe webhook is not configured", { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing stripe signature", { status: 400 });

  const body = await readBodyCapped(req);
  if (body === null) return new Response("payload too large", { status: 413 });
  let event: Stripe.Event;
  try {
    event = await Stripe.webhooks.constructEventAsync(body, signature, secret);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "invalid signature", { status: 400 });
  }

  const lease = await beginWebhookEvent(
    "stripe",
    event.id,
    event.type,
    event,
    new Date(event.created * 1000),
  );
  if (lease.state === "duplicate") {
    return NextResponse.json({
      received: true,
      duplicate: true,
      attempt: lease.attempt,
    });
  }
  if (lease.state === "processing") {
    return NextResponse.json(
      { received: true, processing: true, attempt: lease.attempt },
      { status: 202 },
    );
  }

  try {
    const stripe = new Stripe(key);
    const result = await processStripeBillingEvent(
      stripe,
      billingRepository,
      billingFulfillment,
      event,
    );
    await completeWebhookEvent(lease.id);
    return NextResponse.json({
      received: true,
      duplicate: false,
      attempt: lease.attempt,
      ...result,
    });
  } catch (error) {
    await failWebhookEvent(lease.id, error);
    console.error("Stripe webhook processing failed", {
      eventId: event.id,
      eventType: event.type,
      attempt: lease.attempt,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return new Response("webhook processing failed", { status: 500 });
  }
}
