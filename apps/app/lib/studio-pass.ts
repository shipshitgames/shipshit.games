import { STUDIO_PASS } from "@shipshitgames/shared";
import Stripe from "stripe";

const FOUNDER_AMOUNT_OFF_CENTS = STUDIO_PASS.founderDiscountUsd * 100;

export function studioPassPriceId() {
  const priceId = process.env[STUDIO_PASS.priceEnvKey];
  if (!priceId) {
    throw new Error(`Missing ${STUDIO_PASS.priceEnvKey}`);
  }

  return priceId;
}

export async function founderCouponId(stripe: Stripe) {
  const couponId =
    process.env[STUDIO_PASS.couponEnvKey] ?? STUDIO_PASS.defaultCouponId;

  const coupon = await stripe.coupons.retrieve(couponId);
  if (
    "deleted" in coupon ||
    coupon.amount_off !== FOUNDER_AMOUNT_OFF_CENTS ||
    coupon.currency !== "usd"
  ) {
    throw new Error(
      `${couponId} must be a USD ${STUDIO_PASS.founderDiscountUsd} off coupon`
    );
  }

  return couponId;
}
