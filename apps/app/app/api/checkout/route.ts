import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { STUDIO_PASS } from "@shipshitgames/shared";

import { readBillingEntitlements } from "@/lib/billing";
import { primaryEmail } from "@/lib/entitlements";
import { founderCouponId, studioPassPriceId } from "@/lib/studio-pass";
import { getStripe } from "@/lib/stripe";
import { appUrl } from "@/lib/urls";

export const runtime = "nodejs";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const user = await currentUser();
  const email = primaryEmail(user);
  if (!email) {
    return new NextResponse("Add an email address before checkout.", {
      status: 400,
    });
  }

  const stripe = getStripe();
  const [{ studioPass: pass }, couponId] = await Promise.all([
    readBillingEntitlements(),
    founderCouponId(stripe),
  ]);
  const baseUrl = appUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: pass?.stripeCustomerId,
    customer_email: pass?.stripeCustomerId ? undefined : email,
    billing_address_collection: "auto",
    client_reference_id: userId,
    line_items: [
      {
        price: studioPassPriceId(),
        quantity: 1,
      },
    ],
    discounts: [{ coupon: couponId }],
    metadata: {
      product: STUDIO_PASS.productKey,
      clerkUserId: userId,
      default_coupon: couponId,
    },
    subscription_data: {
      metadata: {
        product: STUDIO_PASS.productKey,
        clerkUserId: userId,
        default_coupon: couponId,
      },
    },
    success_url: `${baseUrl}/claim?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/dashboard`,
  });

  if (!session.url) {
    return new NextResponse("Stripe Checkout session did not return a URL.", {
      status: 500,
    });
  }

  return NextResponse.redirect(session.url, 303);
}
