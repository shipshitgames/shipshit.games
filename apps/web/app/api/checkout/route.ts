import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { SKILLS_PRO } from "@/lib/skills-pro";

export const runtime = "nodejs";

const CHECKOUT_ERROR = "stripe_checkout_unavailable";
const FOUNDER_AMOUNT_OFF_CENTS = SKILLS_PRO.earlyBuyerDiscountUsd * 100;

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

async function getFounderCoupon(stripe: Stripe) {
  const couponId =
    process.env[SKILLS_PRO.couponEnvKey] ??
    SKILLS_PRO.defaultCouponId;

  const coupon = await stripe.coupons.retrieve(couponId);
  if (
    "deleted" in coupon ||
    coupon.amount_off !== FOUNDER_AMOUNT_OFF_CENTS ||
    coupon.currency !== "usd"
  ) {
    throw new Error(
      `${couponId} must be a USD ${SKILLS_PRO.earlyBuyerDiscountUsd} off coupon`
    );
  }

  return couponId;
}

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/pricing", baseUrl(request)), 303);
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return checkoutErrorRedirect(request, "missing_stripe_secret");

  const configuredPriceId = process.env[SKILLS_PRO.priceEnvKey];
  if (!configuredPriceId) return checkoutErrorRedirect(request, "missing_price");

  try {
    const couponId = await getFounderCoupon(stripe);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      billing_address_collection: "auto",
      line_items: [
        {
          price: configuredPriceId,
          quantity: 1,
        },
      ],
      discounts: [{ coupon: couponId }],
      metadata: {
        product: "studio-pass",
        default_coupon: couponId,
      },
      subscription_data: {
        metadata: {
          product: "studio-pass",
          default_coupon: couponId,
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
    console.error("Stripe checkout failed", error);
    return checkoutErrorRedirect(request);
  }
}
