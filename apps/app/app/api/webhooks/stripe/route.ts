import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";
import { syncCheckoutSession, syncSubscriptionEvent } from "@/lib/stripe-sync";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return new NextResponse("Missing Stripe signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      getStripeWebhookSecret()
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid Stripe webhook";
    return new NextResponse(message, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await syncCheckoutSession(
          stripe,
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscriptionEvent(
          stripe,
          event.data.object as Stripe.Subscription
        );
        break;
      default:
        break;
    }
  } catch (error) {
    console.error("Stripe webhook handling failed", error);
    return new NextResponse("Webhook handling failed", { status: 500 });
  }

  return NextResponse.json({ received: true });
}
