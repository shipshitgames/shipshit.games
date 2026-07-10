import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { SKILLS_PRO_ONETIME } from "@shipshitgames/shared";

export const runtime = "nodejs";

const CHECKOUT_ERROR = "stripe_checkout_unavailable";
const LAUNCH_AMOUNT_OFF_CENTS = SKILLS_PRO_ONETIME.launchDiscountUsd * 100;

function baseUrl(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return request.nextUrl.origin;
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shipshit.games").replace(/\/$/, "");
}

function checkoutErrorRedirect(request: NextRequest, reason = CHECKOUT_ERROR) {
  const url = new URL("/pricing", baseUrl(request));
  url.searchParams.set("checkout_error", reason);
  return NextResponse.redirect(url, 303);
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  return new Stripe(key);
}

/**
 * Resolve the launch coupon only while it is still valid. Stripe flips
 * `coupon.valid` to false once `max_redemptions` (the first-1k cap) is hit, so
 * after the cap buyers simply pay the full one-time price with no discount.
 */
async function resolveLaunchCoupon(stripe: Stripe) {
  const couponId =
    process.env[SKILLS_PRO_ONETIME.couponEnvKey] ??
    SKILLS_PRO_ONETIME.defaultCouponId;

  try {
    const coupon = await stripe.coupons.retrieve(couponId);
    if (
      "deleted" in coupon ||
      !coupon.valid ||
      coupon.amount_off !== LAUNCH_AMOUNT_OFF_CENTS ||
      coupon.currency !== "usd"
    ) {
      return null;
    }
    return couponId;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/pricing", baseUrl(request)), 303);
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return checkoutErrorRedirect(request, "missing_stripe_secret");

  const configuredPriceId = process.env[SKILLS_PRO_ONETIME.priceEnvKey];
  if (!configuredPriceId) return checkoutErrorRedirect(request, "missing_price");

  try {
    const couponId = await resolveLaunchCoupon(stripe);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      billing_address_collection: "auto",
      customer_creation: "always",
      line_items: [
        {
          price: configuredPriceId,
          quantity: 1,
        },
      ],
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      metadata: {
        product: SKILLS_PRO_ONETIME.productKey,
        ...(couponId ? { launch_coupon: couponId } : {}),
      },
      payment_intent_data: {
        metadata: {
          product: SKILLS_PRO_ONETIME.productKey,
        },
      },
      success_url: `${appUrl()}/claim?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl(request)}/pricing`,
    });

    if (!session.url) {
      return checkoutErrorRedirect(request);
    }

    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error("Skills Pro one-time checkout failed", error);
    return checkoutErrorRedirect(request);
  }
}
