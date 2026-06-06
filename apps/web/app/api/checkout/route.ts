import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { SKILLS_PRO } from "@/lib/skills-pro";

export const runtime = "nodejs";

const CHECKOUT_ERROR = "stripe_checkout_unavailable";
const EARLY_BUYER_AMOUNT_OFF_CENTS = SKILLS_PRO.earlyBuyerDiscountUsd * 100;

function baseUrl(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return request.nextUrl.origin;
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

async function getEarlyBuyerCoupon(stripe: Stripe) {
  const couponId =
    process.env.STRIPE_SKILLS_PRO_EARLY_COUPON_ID ??
    SKILLS_PRO.defaultCouponId;

  const coupon = await stripe.coupons.retrieve(couponId);
  if (
    "deleted" in coupon ||
    coupon.amount_off !== EARLY_BUYER_AMOUNT_OFF_CENTS ||
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

  const origin = baseUrl(request);
  const configuredPriceId = process.env.STRIPE_SKILLS_PRO_PRICE_ID;

  try {
    const couponId = await getEarlyBuyerCoupon(stripe);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      billing_address_collection: "auto",
      line_items: [
        configuredPriceId
          ? {
              price: configuredPriceId,
              quantity: 1,
            }
          : {
              price_data: {
                currency: "usd",
                unit_amount: SKILLS_PRO.listPriceUsd * 100,
                product_data: {
                  name: `Ship Shit Games ${SKILLS_PRO.name}`,
                  description: SKILLS_PRO.tagline,
                  metadata: {
                    product: "skills-pro",
                    site: "shipshit.games",
                  },
                },
              },
              quantity: 1,
            },
      ],
      discounts: [{ coupon: couponId }],
      metadata: {
        product: "skills-pro",
        default_coupon: couponId,
      },
      payment_intent_data: {
        metadata: {
          product: "skills-pro",
          default_coupon: couponId,
        },
      },
      success_url: `${origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
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
